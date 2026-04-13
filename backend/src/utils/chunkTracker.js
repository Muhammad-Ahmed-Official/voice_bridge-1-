/**
 * CHUNK TRACKER
 *
 * Tracking which chunks are ready, kaunsa complete hua
 * Frontend ko emit karega in order
 */

export class ChunkTracker {
  constructor(totalChunks, timeoutMs = 30000) {
    this.totalChunks = totalChunks;
    this.timeoutMs = timeoutMs;

    // Track status of each chunk
    this.chunks = {};
    for (let i = 0; i < totalChunks; i++) {
      this.chunks[i] = {
        index: i,
        status: 'pending', // pending → ready → played
        audio: null,
        completedAt: null,
        synthesisTimeMs: null,
      };
    }

    // Statistics
    this.startTime = Date.now();
    this.createdAt = new Date();
    this.stats = {
      firstChunkReadyMs: null,
      lastChunkReadyMs: null,
      totalSynthesisMs: null,
      allReadyMs: null,
    };
  }

  /**
   * Mark chunk as ready (call jab synthesis complete ho)
   */
  markChunkReady(chunkIndex, audio, synthesisTimeMs) {
    if (chunkIndex >= this.totalChunks) {
      console.warn(`[ChunkTracker] Invalid chunk index: ${chunkIndex}`);
      return false;
    }

    const chunk = this.chunks[chunkIndex];
    chunk.status = 'ready';
    chunk.audio = audio;
    chunk.completedAt = Date.now();
    chunk.synthesisTimeMs = synthesisTimeMs;

    // Track statistics
    const elapsedMs = Date.now() - this.startTime;
    if (!this.stats.firstChunkReadyMs) {
      this.stats.firstChunkReadyMs = elapsedMs;
      console.log(`[ChunkTracker] First chunk ready in ${elapsedMs}ms`);
    }
    this.stats.lastChunkReadyMs = elapsedMs;

    console.log(
      `[ChunkTracker] Chunk ${chunkIndex} ready (${synthesisTimeMs}ms synthesis) ` +
      `[${this.getReadyCount()}/${this.totalChunks}]`
    );

    return true;
  }

  /**
   * Mark chunk as failed
   */
  markChunkFailed(chunkIndex, error) {
    if (chunkIndex >= this.totalChunks) return false;

    const chunk = this.chunks[chunkIndex];
    chunk.status = 'failed';
    chunk.error = error;
    chunk.completedAt = Date.now();

    console.warn(
      `[ChunkTracker] Chunk ${chunkIndex} failed: ${error}`
    );

    return true;
  }

  /**
   * Get chunks ready count
   */
  getReadyCount() {
    return Object.values(this.chunks).filter(c => c.status === 'ready').length;
  }

  /**
   * Check if all chunks ready
   */
  areAllReady() {
    return this.getReadyCount() === this.totalChunks;
  }

  /**
   * Get chunk by index
   */
  getChunk(index) {
    return this.chunks[index];
  }

  /**
   * Get all chunks in order (ready only)
   */
  getOrderedChunks() {
    const ordered = [];
    for (let i = 0; i < this.totalChunks; i++) {
      const chunk = this.chunks[i];
      if (chunk.status === 'ready') {
        ordered.push(chunk);
      } else {
        // Gap! Not all ready yet
        break;
      }
    }
    return ordered;
  }

  /**
   * Get chunks ready so far (up to first gap)
   * Usage: Send these to frontend for playback
   */
  getPlayableChunks() {
    return this.getOrderedChunks();
  }

  /**
   * Check timeout - agar chunk 30sec se zyada wait kare
   */
  hasTimedOut() {
    const elapsedMs = Date.now() - this.startTime;
    return elapsedMs > this.timeoutMs;
  }

  /**
   * Get statistics
   */
  getStats() {
    const readyCount = this.getReadyCount();
    const failedCount = Object.values(this.chunks).filter(
      c => c.status === 'failed'
    ).length;

    return {
      totalChunks: this.totalChunks,
      readyCount,
      failedCount,
      pendingCount: this.totalChunks - readyCount - failedCount,
      firstChunkReadyMs: this.stats.firstChunkReadyMs,
      lastChunkReadyMs: this.stats.lastChunkReadyMs,
      totalElapsedMs: Date.now() - this.startTime,
      allReady: this.areAllReady(),
      timedOut: this.hasTimedOut(),
    };
  }

  /**
   * Debug: Print status
   */
  debugPrint() {
    console.log('\n📊 CHUNK TRACKER STATUS:');
    console.log(`Total: ${this.totalChunks} | Ready: ${this.getReadyCount()} | Failed: ${Object.values(this.chunks).filter(c => c.status === 'failed').length}`);

    Object.entries(this.chunks).forEach(([idx, chunk]) => {
      const icon = chunk.status === 'ready' ? '✅' : chunk.status === 'failed' ? '❌' : '⏳';
      console.log(
        `  ${icon} Chunk ${idx}: ${chunk.status} ${
          chunk.synthesisTimeMs ? `(${chunk.synthesisTimeMs}ms)` : ''
        }`
      );
    });
    console.log('');
  }
}

/**
 * Manager for multiple TTS synthesis streams
 * (For concurrent users)
 */
export class ConcurrentChunkManager {
  constructor() {
    this.trackers = new Map(); // userId → ChunkTracker
  }

  /**
   * Create tracker for user
   */
  createTracker(userId, totalChunks) {
    const tracker = new ChunkTracker(totalChunks);
    this.trackers.set(userId, tracker);
    return tracker;
  }

  /**
   * Get existing tracker
   */
  getTracker(userId) {
    return this.trackers.get(userId);
  }

  /**
   * Cleanup when done
   */
  cleanup(userId) {
    this.trackers.delete(userId);
  }

  /**
   * Get all active trackers
   */
  getActiveTrackers() {
    return Array.from(this.trackers.entries());
  }
}
