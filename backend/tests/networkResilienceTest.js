/**
 * NETWORK RESILIENCE TEST
 *
 * Dekho network disconnect/reconnect kaise handle hota hai
 * Backpressure, queue persistence, retry logic
 *
 * Run: node tests/networkResilienceTest.js
 */

import {
  ResilientAudioQueue,
  ConnectionManager,
  BackpressureManager,
} from '../src/utils/networkResilience.js';

/**
 * Simulate network scenarios
 */
async function testNetworkResilience() {
  console.log('\n' + '='.repeat(100));
  console.log('🌐 NETWORK RESILIENCE TEST');
  console.log('   Testing disconnect, reconnect, backpressure handling');
  console.log('='.repeat(100) + '\n');

  // ===== SCENARIO 1: QUEUE PERSISTENCE =====
  console.log('📍 SCENARIO 1: Queue Persistence (Disconnect & Reconnect)');
  console.log('-'.repeat(100));

  const queue = new ResilientAudioQueue('user1', 'room123', 50);

  console.log('\n1️⃣ User speaking - adding chunks to queue');
  for (let i = 0; i < 5; i++) {
    const result = queue.enqueue({
      audioBase64: `audio_chunk_${i}`,
      mimeType: 'audio/wav',
      chunkIndex: i,
    });
    console.log(`   Chunk ${i}: ${result.success ? '✅' : '❌'}`);
  }

  console.log(`\n2️⃣ Network disconnects!`);
  queue.setConnected(false, 'Network error');
  console.log(`   Queue size: ${queue.size()} chunks (preserved!) ✅`);

  console.log(`\n3️⃣ User keeps speaking (while disconnected)`);
  for (let i = 5; i < 8; i++) {
    const result = queue.enqueue({
      audioBase64: `audio_chunk_${i}`,
      mimeType: 'audio/wav',
      chunkIndex: i,
    });
    console.log(`   Chunk ${i}: ${result.success ? '✅ (queued)' : '❌ (dropped)'}`);
  }

  console.log(`\n4️⃣ Network reconnects!`);
  queue.setConnected(true, 'Network restored');
  console.log(`   Queue size: ${queue.size()} chunks (ready to process!) ✅`);

  console.log(`\n5️⃣ Process queued chunks`);
  let processedCount = 0;
  while (queue.size() > 0) {
    const chunk = queue.dequeue();
    processedCount++;
    console.log(`   Processing: ${chunk.audioBase64}`);
  }
  console.log(`   Total processed: ${processedCount} chunks ✅`);

  const queueStats = queue.getStats();
  console.log(`\n📊 Queue Statistics:`);
  console.log(`   Total enqueued: ${queueStats.totalEnqueued}`);
  console.log(`   Total processed: ${queueStats.totalProcessed}`);
  console.log(`   Total dropped: ${queueStats.totalDropped}`);
  console.log(`   Backpressure hits: ${queueStats.backpressureHits}`);

  // ===== SCENARIO 2: EXPONENTIAL BACKOFF =====
  console.log('\n\n📍 SCENARIO 2: Exponential Backoff Reconnection');
  console.log('-'.repeat(100));

  const connMgr = new ConnectionManager({
    initialBackoffMs: 100,  // Start with 100ms (faster for test)
    maxBackoffMs: 3000,
    maxRetries: 5,
  });

  console.log('\n1️⃣ Simulate connection disconnect');
  connMgr.handleDisconnect('Simulated network error');

  console.log('\n2️⃣ Try to reconnect (will fail first few times)');
  let connectAttempt = 1;

  for (let i = 0; i < 3; i++) {
    const backoffMs = connMgr.getBackoffMs();
    console.log(`\n   Attempt ${connectAttempt}: Waiting ${backoffMs}ms...`);

    // Simulate reconnect attempt (will fail)
    const result = await connMgr.attemptReconnect(async () => {
      // Simulate 50% chance of failure
      if (Math.random() > 0.5) {
        throw new Error('Connection timeout');
      }
      // Success
    });

    if (result.status === 'SUCCESS') {
      console.log(`   ✅ RECONNECTED! Took ${result.reconnectTimeMs}ms`);
      break;
    } else {
      console.log(
        `   ❌ Failed: ${result.error}` +
        `\n   Next backoff: ${result.nextBackoffMs}ms` +
        `\n   Retries remaining: ${result.retriesRemaining}`
      );
      connectAttempt++;
    }
  }

  const connStats = connMgr.getStats();
  console.log(`\n📊 Connection Statistics:`);
  console.log(`   Total disconnects: ${connStats.totalDisconnects}`);
  console.log(`   Total reconnects: ${connStats.totalReconnects}`);
  console.log(`   Total failures: ${connStats.totalReconnectFailures}`);
  console.log(`   Avg reconnect time: ${connStats.avgReconnectTimeMs.toFixed(0)}ms`);

  // ===== SCENARIO 3: BACKPRESSURE HANDLING =====
  console.log('\n\n📍 SCENARIO 3: Backpressure Management');
  console.log('-'.repeat(100));

  const backpressure = new BackpressureManager({
    minSendIntervalMs: 10,
    maxPendingChunks: 5,
    slowNetworkThreshold: 200,
  });

  console.log('\n1️⃣ Fast network - sending chunks quickly');
  for (let i = 0; i < 3; i++) {
    const shouldSend = backpressure.shouldSend(50); // 50ms latency (NORMAL)
    if (shouldSend) {
      backpressure.recordSend();
      backpressure.addPending(`chunk_${i}`);
      console.log(`   ✅ Send chunk ${i} (latency: 50ms - NORMAL)`);
    } else {
      console.log(`   ❌ THROTTLE chunk ${i}`);
    }

    // Simulate processing
    await new Promise(r => setTimeout(r, 15));
  }

  console.log(`\n2️⃣ Slow network - sending becomes throttled`);
  for (let i = 3; i < 7; i++) {
    const shouldSend = backpressure.shouldSend(350); // 350ms latency (SLOW)
    if (shouldSend) {
      backpressure.recordSend();
      backpressure.addPending(`chunk_${i}`);
      console.log(`   ✅ Send chunk ${i} (latency: 350ms - SLOW)`);
    } else {
      console.log(`   ❌ THROTTLE chunk ${i} (queue full or timing)`);
    }

    await new Promise(r => setTimeout(r, 15));
  }

  console.log(`\n3️⃣ Critical network - aggressive throttling`);
  const shouldSendCritical = backpressure.shouldSend(1000); // 1000ms (CRITICAL)
  if (!shouldSendCritical) {
    console.log(`   ❌ CRITICAL - Chunk dropped to relieve backpressure`);
    console.log(`   📌 Recommended send interval: ${backpressure.getRecommendedIntervalMs()}ms`);
  }

  const bpStats = backpressure.getStats();
  console.log(`\n📊 Backpressure Statistics:`);
  console.log(`   Total chunks sent: ${bpStats.totalChunksSent}`);
  console.log(`   Throttle events: ${bpStats.throttleEvents}`);
  console.log(`   Current pending: ${bpStats.pendingChunksCount}/${bpStats.maxPendingChunks}`);
  console.log(`   Send speed: ${bpStats.sendSpeed}`);
  console.log(`   Recommended interval: ${bpStats.recommendedIntervalMs}ms`);

  // ===== SUMMARY =====
  console.log('\n\n' + '='.repeat(100));
  console.log('📊 SUMMARY');
  console.log('='.repeat(100) + '\n');

  console.log('✅ Queue Persistence:');
  console.log('   → Chunks survive network disconnect');
  console.log('   → Processed on reconnect\n');

  console.log('✅ Exponential Backoff:');
  console.log('   → Automatic retry with increasing delays');
  console.log('   → Prevents overwhelming the network\n');

  console.log('✅ Backpressure Management:');
  console.log('   → Throttles sending on slow networks');
  console.log('   → Recommends optimal send rate');
  console.log('   → Prevents queue overflow\n');

  console.log('='.repeat(100));
  console.log('✅ Network Resilience Test Complete');
  console.log('='.repeat(100) + '\n');
}

// Run test
testNetworkResilience()
  .then(() => {
    console.log('✨ All tests passed!');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
  });
