/**
 * NETWORK RESILIENCE LAYER
 *
 * Handle network disconnects, reconnects, backpressure
 * Queue persistence, auto-retry logic
 */

/**
 * Audio chunk queue with persistence
 * Survives network disconnects
 */
export class ResilientAudioQueue {
  constructor(userId, roomId, maxQueueSize = 50, persistenceStorage = null) {
    this.userId = userId;
    this.roomId = roomId;
    this.maxQueueSize = maxQueueSize;
    this.storage = persistenceStorage; // Optional: localStorage, Redis, etc

    // In-memory queue
    this.queue = [];

    // Metadata
    this.createdAt = Date.now();
    this.lastActivityAt = Date.now();
    this.stats = {
      totalEnqueued: 0,
      totalProcessed: 0,
      totalDropped: 0,
      backpressureHits: 0,
      persistenceSaves: 0,
    };

    // Network status
    this.isConnected = true;
    this.connectionHistory = [];
  }

  /**
   * Enqueue chunk with backpressure
   * Returns: { success, reason, queueLength }
   */
  enqueue(chunk) {
    const now = Date.now();
    this.lastActivityAt = now;

    // Check backpressure
    if (this.queue.length >= this.maxQueueSize) {
      this.stats.backpressureHits++;
      console.warn(
        `[ResilientQueue] Backpressure! Queue full for user=${this.userId} ` +
        `(${this.queue.length}/${this.maxQueueSize})`
      );

      return {
        success: false,
        reason: 'QUEUE_FULL',
        queueLength: this.queue.length,
        action: 'DROP_OLDEST', // Frontend should drop oldest chunk
      };
    }

    // Add metadata
    const enqueuedChunk = {
      ...chunk,
      enqueuedAt: now,
      enqueuedAttempts: 1,
    };

    this.queue.push(enqueuedChunk);
    this.stats.totalEnqueued++;

    // Persist if enabled
    if (this.storage) {
      this._persistQueue();
    }

    return {
      success: true,
      queueLength: this.queue.length,
      maxQueueSize: this.maxQueueSize,
    };
  }

  /**
   * Dequeue chunk (FIFO)
   */
  dequeue() {
    this.lastActivityAt = Date.now();

    if (this.queue.length === 0) {
      return null;
    }

    const chunk = this.queue.shift();
    this.stats.totalProcessed++;

    // Persist
    if (this.storage) {
      this._persistQueue();
    }

    return chunk;
  }

  /**
   * Peek at next chunk without removing
   */
  peek() {
    return this.queue.length > 0 ? this.queue[0] : null;
  }

  /**
   * Get queue length
   */
  size() {
    return this.queue.length;
  }

  /**
   * Clear queue
   */
  clear() {
    const count = this.queue.length;
    this.queue = [];
    this.stats.totalDropped += count;

    if (this.storage) {
      this._persistQueue();
    }

    return count;
  }

  /**
   * Get queue statistics
   */
  getStats() {
    const utilizationPercent = (this.queue.length / this.maxQueueSize) * 100;

    return {
      ...this.stats,
      currentQueueSize: this.queue.length,
      maxQueueSize: this.maxQueueSize,
      utilizationPercent: utilizationPercent.toFixed(1),
      isConnected: this.isConnected,
      uptime: Date.now() - this.createdAt,
      lastActivityAgo: Date.now() - this.lastActivityAt,
    };
  }

  /**
   * Mark connection status
   */
  setConnected(isConnected, reason = '') {
    const wasConnected = this.isConnected;
    this.isConnected = isConnected;

    this.connectionHistory.push({
      timestamp: Date.now(),
      status: isConnected ? 'CONNECTED' : 'DISCONNECTED',
      reason,
    });

    console.log(
      `[ResilientQueue] Connection change: ${wasConnected ? '✅' : '❌'} → ${
        isConnected ? '✅' : '❌'
      } (reason: ${reason})`
    );

    // Keep last 100 history items
    if (this.connectionHistory.length > 100) {
      this.connectionHistory = this.connectionHistory.slice(-100);
    }

    return {
      wasConnected,
      isConnected,
      queuePreserved: this.queue.length,
    };
  }

  /**
   * Get connection history
   */
  getConnectionHistory() {
    return this.connectionHistory;
  }

  /**
   * Retry a chunk (increment retry count)
   */
  retryChunk(chunk) {
    chunk.enqueuedAttempts = (chunk.enqueuedAttempts || 1) + 1;
    this.queue.push(chunk); // Add back to end of queue
  }

  /**
   * Persist queue to storage (if available)
   */
  _persistQueue() {
    if (!this.storage) return;

    try {
      const key = `queue_${this.roomId}_${this.userId}`;
      this.storage.setItem(key, JSON.stringify({
        queue: this.queue,
        stats: this.stats,
        timestamp: Date.now(),
      }));
      this.stats.persistenceSaves++;
    } catch (err) {
      console.warn('[ResilientQueue] Persistence failed:', err.message);
    }
  }

  /**
   * Restore queue from storage
   */
  _restoreQueue() {
    if (!this.storage) return false;

    try {
      const key = `queue_${this.roomId}_${this.userId}`;
      const data = this.storage.getItem(key);

      if (!data) return false;

      const { queue, stats } = JSON.parse(data);
      this.queue = queue;
      // Merge stats
      Object.assign(this.stats, stats);

      console.log(`[ResilientQueue] Restored ${queue.length} chunks`);
      return true;
    } catch (err) {
      console.warn('[ResilientQueue] Restore failed:', err.message);
      return false;
    }
  }
}

/**
 * Connection manager with exponential backoff retry
 */
export class ConnectionManager {
  constructor(options = {}) {
    const {
      initialBackoffMs = 1000,
      maxBackoffMs = 30000,
      maxRetries = 10,
    } = options;

    this.initialBackoffMs = initialBackoffMs;
    this.maxBackoffMs = maxBackoffMs;
    this.maxRetries = maxRetries;

    this.isConnected = true;
    this.reconnectAttempts = 0;
    this.lastReconnectAttemptAt = null;
    this.reconnectInProgress = false;

    this.stats = {
      totalDisconnects: 0,
      totalReconnects: 0,
      totalReconnectFailures: 0,
      avgReconnectTimeMs: 0,
    };
  }

  /**
   * Calculate backoff time
   * 1s, 2s, 4s, 8s, 16s... (capped at maxBackoffMs)
   */
  getBackoffMs() {
    const exponentialBackoff = this.initialBackoffMs *
      Math.pow(2, Math.min(this.reconnectAttempts, 10));

    return Math.min(exponentialBackoff, this.maxBackoffMs);
  }

  /**
   * Handle disconnection
   */
  handleDisconnect(reason = 'unknown') {
    if (!this.isConnected) {
      return; // Already disconnected
    }

    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.stats.totalDisconnects++;

    console.log(`[ConnectionManager] DISCONNECTED: ${reason}`);

    return {
      action: 'START_RECONNECT',
      reason,
      timestamp: Date.now(),
    };
  }

  /**
   * Attempt to reconnect
   */
  async attemptReconnect(reconnectFn) {
    if (this.reconnectInProgress) {
      return { status: 'IN_PROGRESS' };
    }

    if (this.reconnectAttempts >= this.maxRetries) {
      console.error('[ConnectionManager] Max reconnect attempts reached');
      this.stats.totalReconnectFailures++;
      return {
        status: 'FAILED',
        reason: 'MAX_RETRIES_REACHED',
        attempts: this.reconnectAttempts,
      };
    }

    this.reconnectInProgress = true;
    const backoffMs = this.getBackoffMs();
    const attemptNum = this.reconnectAttempts + 1;

    console.log(
      `[ConnectionManager] Reconnect attempt ${attemptNum}/${this.maxRetries} ` +
      `(waiting ${backoffMs}ms)...`
    );

    // Wait before retry
    await new Promise(r => setTimeout(r, backoffMs));

    try {
      const startMs = Date.now();
      await reconnectFn();
      const reconnectTimeMs = Date.now() - startMs;

      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.stats.totalReconnects++;

      // Update average
      const alpha = 0.3;
      this.stats.avgReconnectTimeMs =
        this.stats.avgReconnectTimeMs * (1 - alpha) +
        reconnectTimeMs * alpha;

      console.log(
        `[ConnectionManager] ✅ RECONNECTED in ${reconnectTimeMs}ms ` +
        `(attempt ${attemptNum})`
      );

      return {
        status: 'SUCCESS',
        attemptNum,
        reconnectTimeMs,
        totalStats: this.stats,
      };
    } catch (err) {
      this.reconnectAttempts++;
      console.warn(
        `[ConnectionManager] Reconnect attempt ${attemptNum} failed:`,
        err.message
      );

      return {
        status: 'FAILED',
        attemptNum,
        error: err.message,
        nextBackoffMs: this.getBackoffMs(),
        retriesRemaining: this.maxRetries - this.reconnectAttempts,
      };
    } finally {
      this.reconnectInProgress = false;
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      ...this.stats,
      isConnected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      currentBackoffMs: this.getBackoffMs(),
      maxRetries: this.maxRetries,
    };
  }
}

/**
 * Backpressure manager - throttle sending based on network speed
 */
export class BackpressureManager {
  constructor(options = {}) {
    const {
      minSendIntervalMs = 10,      // Min 10ms between sends
      maxPendingChunks = 20,        // Max 20 chunks waiting
      slowNetworkThreshold = 500,   // > 500ms = slow network
    } = options;

    this.minSendIntervalMs = minSendIntervalMs;
    this.maxPendingChunks = maxPendingChunks;
    this.slowNetworkThreshold = slowNetworkThreshold;

    this.lastSendAt = 0;
    this.pendingChunks = [];
    this.sendSpeed = 'NORMAL'; // NORMAL, SLOW, CRITICAL

    this.stats = {
      totalChunksSent: 0,
      totalChunksPending: 0,
      throttleEvents: 0,
    };
  }

  /**
   * Should we send next chunk?
   * Checks timing and queue depth
   */
  shouldSend(chunkLatencyMs = 0) {
    const timeSinceLastSend = Date.now() - this.lastSendAt;
    const hasWaitedEnough = timeSinceLastSend >= this.minSendIntervalMs;
    const queueNotFull = this.pendingChunks.length < this.maxPendingChunks;

    // Detect network speed
    if (chunkLatencyMs > this.slowNetworkThreshold) {
      this.sendSpeed = 'SLOW';
    } else if (chunkLatencyMs > this.slowNetworkThreshold * 2) {
      this.sendSpeed = 'CRITICAL';
    } else {
      this.sendSpeed = 'NORMAL';
    }

    // Decision
    if (!hasWaitedEnough) {
      this.stats.throttleEvents++;
      return false;
    }

    if (!queueNotFull) {
      console.warn(
        `[Backpressure] Queue full (${this.pendingChunks.length}/${this.maxPendingChunks})`
      );
      this.stats.throttleEvents++;
      return false;
    }

    return true;
  }

  /**
   * Record chunk sent
   */
  recordSend() {
    this.lastSendAt = Date.now();
    this.stats.totalChunksSent++;
  }

  /**
   * Add pending chunk
   */
  addPending(chunkId) {
    this.pendingChunks.push(chunkId);
    this.stats.totalChunksPending++;
  }

  /**
   * Remove pending chunk (when acked)
   */
  removePending(chunkId) {
    const idx = this.pendingChunks.indexOf(chunkId);
    if (idx !== -1) {
      this.pendingChunks.splice(idx, 1);
    }
  }

  /**
   * Get recommended send interval based on network
   */
  getRecommendedIntervalMs() {
    switch (this.sendSpeed) {
      case 'CRITICAL':
        return 100; // Slow down a lot
      case 'SLOW':
        return 50;  // Slow down
      case 'NORMAL':
      default:
        return this.minSendIntervalMs;
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      ...this.stats,
      sendSpeed: this.sendSpeed,
      pendingChunksCount: this.pendingChunks.length,
      maxPendingChunks: this.maxPendingChunks,
      recommendedIntervalMs: this.getRecommendedIntervalMs(),
    };
  }
}
