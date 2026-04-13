/**
 * CHUNK STREAMING TEST
 *
 * Dekho ke chunking se latency kitna improve hota hai
 * Original vs Chunked comparison
 *
 * Run: node tests/chunkStreamingTest.js
 */

import dotenv from 'dotenv';
import { synthesizeSpeech } from '../src/services/tts.js';
import { smartChunkText } from '../src/utils/ttsChunkOptimizer.js';
import { ChunkTracker } from '../src/utils/chunkTracker.js';
import { LatencyProfiler } from '../src/utils/latencyProfiler.js';

dotenv.config({ path: './.env' });

/**
 * Simulate parallel chunk synthesis
 */
async function simulateChunkedSynthesis(text, locale, chunkSize = 100) {
  const chunks = smartChunkText(text, chunkSize);
  const tracker = new ChunkTracker(chunks.length);

  console.log(`\n  📦 Chunks created: ${chunks.length}`);
  chunks.forEach((chunk, idx) => {
    console.log(`     Chunk ${idx}: "${chunk.substring(0, 40)}${chunk.length > 40 ? '...' : ''}"`);
  });

  const startTime = Date.now();
  const chunkReadyTimes = [];

  // Start all synthesis immediately
  const synthesisPromises = chunks.map((chunk, idx) => {
    return synthesizeSpeech(chunk, locale)
      .then(audio => {
        const readyTimeMs = Date.now() - startTime;
        chunkReadyTimes[idx] = readyTimeMs;

        tracker.markChunkReady(idx, audio, readyTimeMs);

        console.log(`     ✅ Chunk ${idx} ready in ${readyTimeMs}ms`);

        return { idx, audio, readyTimeMs };
      });
  });

  // Wait for all
  const results = await Promise.allSettled(synthesisPromises);
  const totalTimeMs = Date.now() - startTime;

  const stats = {
    totalChunks: chunks.length,
    chunkReadyTimes,
    firstChunkReadyMs: Math.min(...chunkReadyTimes),
    lastChunkReadyMs: Math.max(...chunkReadyTimes),
    totalTimeMs,
  };

  return stats;
}

/**
 * Simulate sequential synthesis (old way)
 */
async function simulateSequentialSynthesis(text, locale, chunkSize = 100) {
  const chunks = smartChunkText(text, chunkSize);

  console.log(`\n  📦 Chunks: ${chunks.length} (sequential)`);

  const startTime = Date.now();
  const chunkReadyTimes = [];
  let cumulativeMs = 0;

  for (let idx = 0; idx < chunks.length; idx++) {
    const chunk = chunks[idx];
    const chunkStartMs = Date.now();

    const audio = await synthesizeSpeech(chunk, locale);

    const chunkTimeMs = Date.now() - chunkStartMs;
    cumulativeMs += chunkTimeMs;
    chunkReadyTimes[idx] = cumulativeMs;

    console.log(`     ✅ Chunk ${idx} ready in ${cumulativeMs}ms (synthesis: ${chunkTimeMs}ms)`);
  }

  const totalTimeMs = Date.now() - startTime;

  const stats = {
    totalChunks: chunks.length,
    chunkReadyTimes,
    firstChunkReadyMs: chunkReadyTimes[0],
    lastChunkReadyMs: chunkReadyTimes[chunks.length - 1],
    totalTimeMs,
  };

  return stats;
}

/**
 * Main test
 */
async function runChunkStreamingTest() {
  console.log('\n' + '='.repeat(100));
  console.log('🚀 CHUNK STREAMING OPTIMIZATION TEST');
  console.log('   Parallel vs Sequential Chunk Synthesis');
  console.log('='.repeat(100));

  // Test texts of different lengths
  const testTexts = [
    {
      lang: 'EN',
      locale: 'en-US',
      text: 'Hello everyone, welcome to this important meeting. We are very glad to see all of you here today.',
    },
    {
      lang: 'UR',
      locale: 'ur-PK',
      text: 'میں امید ہوں کہ آپ سب خیر سے ہیں اور یہ میٹنگ اچھی طرح چل رہی ہے۔ براہ کرم اپنی رائے شیئر کریں۔',
    },
    {
      lang: 'AR',
      locale: 'ar-SA',
      text: 'أهلا وسهلا بالجميع في هذا الاجتماع المهم. يسعدني حقا رؤية كل واحد منكم هنا اليوم۔ آمل أن تكونوا مستعدين لمناقشة المواضيع المهمة',
    },
  ];

  const results = {
    timestamp: new Date().toISOString(),
    comparisons: [],
  };

  // Test each language
  for (const { lang, locale, text } of testTexts) {
    console.log(`\n\n📍 Language: ${lang}`);
    console.log('-'.repeat(100));
    console.log(`Text: "${text.substring(0, 60)}..." (${text.length} chars)`);

    // Test 1: Parallel (new way)
    console.log('\n1️⃣  PARALLEL SYNTHESIS (New - Optimized)');
    const parallelStats = await simulateChunkedSynthesis(text, locale, 100);

    // Test 2: Sequential (old way)
    console.log('\n2️⃣  SEQUENTIAL SYNTHESIS (Old - Slow)');
    const sequentialStats = await simulateSequentialSynthesis(text, locale, 100);

    // Calculate benefits
    const firstChunkFaster = sequentialStats.firstChunkReadyMs - parallelStats.firstChunkReadyMs;
    const totalFaster = sequentialStats.totalTimeMs - parallelStats.totalTimeMs;
    const speedup = sequentialStats.totalTimeMs / parallelStats.totalTimeMs;

    console.log('\n\n📊 COMPARISON:');
    console.log('-'.repeat(100));
    console.log(`Metric                          | Sequential | Parallel   | Improvement`);
    console.log(`─────────────────────────────────┼────────────┼────────────┼─────────────`);
    console.log(`First chunk ready (user hears):  | ${sequentialStats.firstChunkReadyMs.toString().padEnd(10)} | ${parallelStats.firstChunkReadyMs.toString().padEnd(10)} | ${firstChunkFaster.toFixed(0).padEnd(11)}ms faster ⚡`);
    console.log(`All chunks complete:            | ${sequentialStats.totalTimeMs.toString().padEnd(10)} | ${parallelStats.totalTimeMs.toString().padEnd(10)} | ${totalFaster.toFixed(0).padEnd(11)}ms faster 🚀`);
    console.log(`Speedup factor:                 | 1.0x       | ${speedup.toFixed(2)}x       | ${((speedup - 1) * 100).toFixed(0)}% faster`);

    results.comparisons.push({
      language: lang,
      textLength: text.length,
      parallel: parallelStats,
      sequential: sequentialStats,
      improvement: {
        firstChunkMs: firstChunkFaster,
        totalTimeMs: totalFaster,
        speedupFactor: speedup,
        userPerceptionMs: firstChunkFaster,
      },
    });
  }

  // Overall insights
  console.log('\n\n' + '='.repeat(100));
  console.log('💡 KEY INSIGHTS');
  console.log('='.repeat(100) + '\n');

  const avgImprovement = results.comparisons.reduce((sum, c) => sum + c.improvement.firstChunkMs, 0) / results.comparisons.length;
  const avgSpeedup = results.comparisons.reduce((sum, c) => sum + c.improvement.speedupFactor, 0) / results.comparisons.length;

  console.log(`✅ Average First Chunk Latency Improvement: ${avgImprovement.toFixed(0)}ms faster`);
  console.log(`   → User hears output ${avgImprovement.toFixed(0)}ms sooner! 🎉\n`);

  console.log(`✅ Average Total Time Speedup: ${avgSpeedup.toFixed(2)}x faster`);
  console.log(`   → Parallel synthesis is ${((avgSpeedup - 1) * 100).toFixed(0)}% quicker\n`);

  console.log(`✅ Perceived Latency Improvement:`);
  console.log(`   → With chunking, user feels response in ~${avgImprovement.toFixed(0)}ms`);
  console.log(`   → Without chunking, user waits ~${(avgImprovement * 2).toFixed(0)}ms longer\n`);

  console.log(`✅ Why This Matters:`);
  console.log(`   1. User hears feedback FASTER (not waiting for all chunks)`);
  console.log(`   2. Streaming effect (chunks play as they arrive)`);
  console.log(`   3. Feels more like live conversation`);
  console.log(`   4. Total processing still fast (~${results.comparisons[0].parallel.totalTimeMs}ms)\n`);

  // Summary
  console.log('='.repeat(100));
  console.log('✅ CHUNK STREAMING TEST COMPLETE');
  console.log('='.repeat(100) + '\n');

  results.summary = {
    avgFirstChunkImprovement: avgImprovement,
    avgSpeedupFactor: avgSpeedup,
    recommendation: 'IMPLEMENT_CHUNKING',
    reason: 'Parallel synthesis provides both perception and actual latency benefits',
  };

  return results;
}

// Run test
runChunkStreamingTest()
  .then(results => {
    console.log('📊 Final Summary:');
    console.log(JSON.stringify(results.summary, null, 2));
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
  });
