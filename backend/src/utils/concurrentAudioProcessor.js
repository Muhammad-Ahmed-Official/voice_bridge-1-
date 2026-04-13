/**
 * CONCURRENT AUDIO PROCESSOR
 * Handles multiple users speaking simultaneously
 * Processes audio in parallel per-user queues instead of dropping chunks
 */

import { transcribeAudio } from '../services/stt.js';
import { translateText } from '../services/translate.js';

const MAX_QUEUE_SIZE = 15; // Max chunks per user before backpressure
const QUEUE_TIMEOUT_MS = 30000; // Drop chunk if queued > 30s

/**
 * Audio queue for each user in a room
 * Maintains order per-user but processes multiple users in parallel
 */
class ConcurrentAudioQueue {
  constructor(userId) {
    this.userId = userId;
    this.queue = [];
    this.processing = false;
    this.createdAt = Date.now();
    this.stats = {
      totalChunksReceived: 0,
      totalChunksProcessed: 0,
      totalChunksDropped: 0,
      avgProcessingTimeMs: 0,
      peakQueueSize: 0,
    };
  }

  /**
   * Add a chunk to the queue
   * Returns true if queued, false if dropped due to backpressure
   */
  enqueue(chunk) {
    this.stats.totalChunksReceived++;

    if (this.queue.length >= MAX_QUEUE_SIZE) {
      this.stats.totalChunksDropped++;
      console.warn(
        `[ConcurrentProcessor] Queue full for user=${this.userId}, dropping chunk (queue=${this.queue.length})`
      );
      return false; // Backpressure: drop chunk
    }

    chunk.enqueuedAt = Date.now();
    this.queue.push(chunk);

    if (this.queue.length > this.stats.peakQueueSize) {
      this.stats.peakQueueSize = this.queue.length;
    }

    return true;
  }

  /**
   * Get next chunk from queue
   */
  dequeue() {
    return this.queue.shift();
  }

  /**
   * Check if queue has items
   */
  hasItems() {
    return this.queue.length > 0;
  }

  /**
   * Check if chunk is too old (stale)
   */
  isChunkStale(chunk) {
    const ageMs = Date.now() - chunk.enqueuedAt;
    return ageMs > QUEUE_TIMEOUT_MS;
  }

  /**
   * Get queue statistics
   */
  getStats() {
    return {
      ...this.stats,
      currentQueueSize: this.queue.length,
      isProcessing: this.processing,
      uptimeMs: Date.now() - this.createdAt,
    };
  }

  /**
   * Reset stats for fresh measurement
   */
  resetStats() {
    this.stats = {
      totalChunksReceived: 0,
      totalChunksProcessed: 0,
      totalChunksDropped: 0,
      avgProcessingTimeMs: 0,
      peakQueueSize: 0,
    };
  }
}

/**
 * Manager for concurrent audio queues across all users in a room
 */
export class ConcurrentAudioManager {
  constructor(roomId) {
    this.roomId = roomId;
    this.userQueues = new Map(); // userId -> ConcurrentAudioQueue
    this.processingPool = new Set(); // Track concurrent processing jobs
    this.globalStats = {
      roomCreatedAt: Date.now(),
      totalProcessingJobs: 0,
      concurrentPeakUsers: 0,
    };
  }

  /**
   * Get or create queue for a user
   */
  getQueue(userId) {
    if (!this.userQueues.has(userId)) {
      this.userQueues.set(userId, new ConcurrentAudioQueue(userId));
    }
    return this.userQueues.get(userId);
  }

  /**
   * Enqueue an audio chunk for a user
   */
  enqueueChunk(userId, audioBase64, mimeType) {
    const queue = this.getQueue(userId);
    return queue.enqueue({ audioBase64, mimeType });
  }

  /**
   * Process all pending chunks for all users in parallel
   * This is the key concurrency mechanism
   */
  async processAllPendingChunks(processingFn) {
    const activeQueues = Array.from(this.userQueues.entries())
      .filter(([, queue]) => queue.hasItems() && !queue.processing)
      .map(([userId, queue]) => ({ userId, queue }));

    if (activeQueues.length === 0) {
      return [];
    }

    // Track concurrent user count for analytics
    if (activeQueues.length > this.globalStats.concurrentPeakUsers) {
      this.globalStats.concurrentPeakUsers = activeQueues.length;
    }

    // Process all queues in parallel
    const results = await Promise.allSettled(
      activeQueues.map(({ userId, queue }) =>
        this._processUserQueue(userId, queue, processingFn)
      )
    );

    return results;
  }

  /**
   * Internal: Process all chunks in a user's queue sequentially
   */
  async _processUserQueue(userId, queue, processingFn) {
    queue.processing = true;
    const results = [];

    try {
      while (queue.hasItems()) {
        const chunk = queue.dequeue();

        // Skip stale chunks
        if (queue.isChunkStale(chunk)) {
          queue.stats.totalChunksDropped++;
          console.warn(`[ConcurrentProcessor] Dropped stale chunk for user=${userId}`);
          continue;
        }

        const processingStartMs = Date.now();
        const startTime = Date.now();

        try {
          const result = await processingFn(userId, chunk);
          const processingTimeMs = Date.now() - processingStartMs;

          // Update average processing time (exponential moving average)
          const alpha = 0.3; // Weight of new sample
          queue.stats.avgProcessingTimeMs =
            queue.stats.avgProcessingTimeMs * (1 - alpha) +
            processingTimeMs * alpha;

          queue.stats.totalChunksProcessed++;
          results.push({
            userId,
            success: true,
            processingTimeMs,
            result,
          });

          this.globalStats.totalProcessingJobs++;
        } catch (err) {
          results.push({
            userId,
            success: false,
            error: err.message,
          });
        }
      }
    } finally {
      queue.processing = false;
    }

    return results;
  }

  /**
   * Get all queue statistics (for monitoring)
   */
  getAllStats() {
    const userStats = {};
    this.userQueues.forEach((queue, userId) => {
      userStats[userId] = queue.getStats();
    });

    return {
      roomId: this.roomId,
      globalStats: this.globalStats,
      userStats,
      totalActiveQueues: this.userQueues.size,
    };
  }

  /**
   * Get queue statistics for a specific user
   */
  getUserStats(userId) {
    const queue = this.userQueues.get(userId);
    return queue ? queue.getStats() : null;
  }

  /**
   * Cleanup when room closes
   */
  cleanup() {
    this.userQueues.clear();
    this.processingPool.clear();
  }
}

/**
 * Global manager for all rooms
 */
class ConcurrentAudioService {
  constructor() {
    this.roomManagers = new Map(); // roomId -> ConcurrentAudioManager
  }

  /**
   * Get or create manager for a room
   */
  getManager(roomId) {
    if (!this.roomManagers.has(roomId)) {
      this.roomManagers.set(roomId, new ConcurrentAudioManager(roomId));
    }
    return this.roomManagers.get(roomId);
  }

  /**
   * Enqueue chunk for a user in a room
   */
  enqueueChunk(roomId, userId, audioBase64, mimeType) {
    const manager = this.getManager(roomId);
    return manager.enqueueChunk(userId, audioBase64, mimeType);
  }

  /**
   * Process all pending chunks in a room
   */
  async processRoom(roomId, processingFn) {
    const manager = this.getManager(roomId);
    return manager.processAllPendingChunks(processingFn);
  }

  /**
   * Get statistics for a room
   */
  getRoomStats(roomId) {
    const manager = this.roomManagers.get(roomId);
    return manager ? manager.getAllStats() : null;
  }

  /**
   * Close room and cleanup
   */
  closeRoom(roomId) {
    const manager = this.roomManagers.get(roomId);
    if (manager) {
      manager.cleanup();
    }
    this.roomManagers.delete(roomId);
  }
}

// Export singleton instance
export const concurrentAudioService = new ConcurrentAudioService();
