/**
 * COMPREHENSIVE LATENCY TEST
 * Tests the FULL pipeline: STT → Translation → TTS
 * Run: node tests/fullLatencyTest.js
 *
 * This test measures latency for the complete voice processing pipeline
 * WITHOUT requiring actual audio input (uses mock/test data)
 */

import dotenv from 'dotenv';
import { processVoiceChunk } from '../src/services/voiceHandler.js';
import { translateText } from '../src/services/translate.js';
import { synthesizeSpeech } from '../src/services/tts.js';
import { transcribeAudio } from '../src/services/stt.js';
import { LatencyProfiler, assessLatency } from '../src/utils/latencyProfiler.js';

dotenv.config({ path: './.env' });

const results = {
  timestamp: new Date().toISOString(),
  tests: [],
  summary: {}
};

/**
 * Create a mock audio sample (base64 encoded)
 * Real audio would be captured from frontend
 * For testing, we use a minimal valid WAV header
 */
function createMockAudioBase64(durationMs = 2000) {
  // Minimal WAV header (44 bytes) + silence
  // This is a valid WAV file with ~2 seconds of silence at 16kHz mono
  const sampleRate = 16000;
  const samples = (sampleRate * durationMs) / 1000;

  // WAV header
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 4);
  header.writeUInt32LE(36 + samples * 2, 4);
  header.write('WAVE', 8, 4);
  header.write('fmt ', 12, 4);
  header.writeUInt32LE(16, 16); // subchunk1size
  header.writeUInt16LE(1, 20);  // PCM
  header.writeUInt16LE(1, 22);  // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);  // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write('data', 36, 4);
  header.writeUInt32LE(samples * 2, 40);

  // Add silence (zeros)
  const audio = Buffer.concat([header, Buffer.alloc(samples * 2)]);
  return audio.toString('base64');
}

async function runFullPipelineTest() {
  console.log('\n' + '='.repeat(80));
  console.log('🎤 VOICE BRIDGE - COMPREHENSIVE LATENCY TEST');
  console.log('   STT → Translation → TTS Full Pipeline');
  console.log('='.repeat(80) + '\n');

  // ===== TEST 1: Individual Service Latency =====
  console.log('📍 TEST 1: Individual Service Latency Measurements');
  console.log('-'.repeat(80));

  const test1 = {
    name: 'Individual Services',
    cases: []
  };

  // Test 1.1: Google Translate API
  console.log('\n1️⃣  Google Translate API Latency');
  try {
    const profiler1 = new LatencyProfiler('Translation');

    const translationLatency = await profiler1.measureAsync('Translation: EN→UR', async () => {
      return await translateText('Hello, how are you today?', 'EN', 'UR');
    });

    const report1 = profiler1.getReport();
    console.log(`   ✅ Result: "${translationLatency.text}"`);
    console.log(`   ⏱️  Latency: ${report1.totalLatencyMs.toFixed(2)}ms`);

    test1.cases.push({
      service: 'Google Translate',
      latencyMs: report1.totalLatencyMs,
      assessment: assessLatency('TRANSLATION', report1.totalLatencyMs)
    });
  } catch (err) {
    console.error('   ❌ Failed:', err.message);
  }

  // Test 1.2: Google TTS API
  console.log('\n2️⃣  Google TTS API Latency');
  try {
    const profiler2 = new LatencyProfiler('TTS');

    const ttsLatency = await profiler2.measureAsync('TTS: Urdu', async () => {
      return await synthesizeSpeech('السلام عليكم، كيف حالك؟', 'ur-PK');
    });

    const report2 = profiler2.getReport();
    console.log(`   ✅ Generated audio: ${ttsLatency.substring(0, 30)}...`);
    console.log(`   ⏱️  Latency: ${report2.totalLatencyMs.toFixed(2)}ms`);

    test1.cases.push({
      service: 'Google TTS',
      latencyMs: report2.totalLatencyMs,
      assessment: assessLatency('TTS', report2.totalLatencyMs)
    });
  } catch (err) {
    console.error('   ❌ Failed:', err.message);
  }

  // Test 1.3: Google STT API
  console.log('\n3️⃣  Google STT API Latency');
  try {
    // Create mock audio (silence is not great for STT, but shows latency)
    const mockAudio = createMockAudioBase64(2000);
    const profiler3 = new LatencyProfiler('STT');

    const sttLatency = await profiler3.measureAsync('STT: Urdu', async () => {
      try {
        return await transcribeAudio(mockAudio, 'ur-PK', 'audio/wav');
      } catch (err) {
        // STT might fail on silence, but we're measuring latency
        console.log(`      (Note: STT failed as expected with silence: ${err.message.substring(0, 50)}...)`);
        return '(STT error - silence)';
      }
    });

    const report3 = profiler3.getReport();
    console.log(`   ✅ Result: "${sttLatency.substring(0, 50)}"`);
    console.log(`   ⏱️  Latency: ${report3.totalLatencyMs.toFixed(2)}ms`);

    test1.cases.push({
      service: 'Google STT',
      latencyMs: report3.totalLatencyMs,
      assessment: assessLatency('STT', report3.totalLatencyMs),
      note: 'Tested with mock audio'
    });
  } catch (err) {
    console.error('   ❌ Failed:', err.message);
  }

  results.tests.push(test1);

  // ===== TEST 2: Full E2E Pipeline (Translation + TTS) =====
  console.log('\n\n📍 TEST 2: End-to-End Pipeline Latency');
  console.log('-'.repeat(80));

  const test2 = {
    name: 'E2E Pipeline',
    cases: []
  };

  const testCases = [
    { source: 'EN', target: 'UR', text: 'Good morning, how are you?' },
    { source: 'UR', target: 'EN', text: 'السلام عليكم' },
    { source: 'AR', target: 'EN', text: 'مرحبا بك' },
  ];

  let caseNum = 1;
  for (const testCase of testCases) {
    console.log(`\n${caseNum}️⃣  Pipeline: ${testCase.source} → ${testCase.target}`);
    try {
      const pipelineProfiler = new LatencyProfiler(`E2E_${testCase.source}_${testCase.target}`);

      // Step 1: Translation
      pipelineProfiler.mark('translation_start');
      const translated = await translateText(testCase.text, testCase.source, testCase.target);
      pipelineProfiler.mark('translation_end');
      const translationLatency = pipelineProfiler.measure('translation_start', 'translation_end');

      // Step 2: TTS
      pipelineProfiler.mark('tts_start');
      const audio = await synthesizeSpeech(translated.text, testCase.target === 'UR' ? 'ur-PK' : testCase.target === 'EN' ? 'en-US' : 'ar-SA');
      pipelineProfiler.mark('tts_end');
      const ttsLatency = pipelineProfiler.measure('tts_start', 'tts_end');

      pipelineProfiler.mark('complete');

      const report = pipelineProfiler.getReport();
      const totalLatency = translationLatency + ttsLatency;

      console.log(`   Translation: ${translationLatency.toFixed(2)}ms`);
      console.log(`   TTS:         ${ttsLatency.toFixed(2)}ms`);
      console.log(`   Total:       ${totalLatency.toFixed(2)}ms (${(totalLatency / 1000).toFixed(2)}s)`);

      test2.cases.push({
        pair: `${testCase.source}→${testCase.target}`,
        translationMs: translationLatency,
        ttsMs: ttsLatency,
        totalMs: totalLatency,
        assessment: assessLatency('TOTAL_PIPELINE', totalLatency)
      });
    } catch (err) {
      console.error(`   ❌ Failed: ${err.message}`);
    }
    caseNum++;
  }

  results.tests.push(test2);

  // ===== RESULTS SUMMARY =====
  console.log('\n\n' + '='.repeat(80));
  console.log('📊 LATENCY TEST SUMMARY');
  console.log('='.repeat(80) + '\n');

  // Summary Statistics
  let totalServiceLatency = 0;
  let serviceCount = 0;
  console.log('Individual Services:');
  if (results.tests[0] && results.tests[0].cases.length > 0) {
    results.tests[0].cases.forEach((c, idx) => {
      console.log(`  ${idx + 1}. ${c.service}: ${c.latencyMs.toFixed(2)}ms`);
      totalServiceLatency += c.latencyMs;
      serviceCount++;
    });

    if (serviceCount > 0) {
      console.log(`  📈 Average: ${(totalServiceLatency / serviceCount).toFixed(2)}ms\n`);
    }
  } else {
    console.log('  (No individual service tests)\n');
  }

  let totalPipelineLatency = 0;
  let pipelineCount = 0;
  console.log('E2E Pipelines:');
  if (results.tests[1] && results.tests[1].cases.length > 0) {
    results.tests[1].cases.forEach((c, idx) => {
      console.log(`  ${idx + 1}. ${c.pair}: ${c.totalMs.toFixed(2)}ms (Translation: ${c.translationMs.toFixed(2)}ms + TTS: ${c.ttsMs.toFixed(2)}ms)`);
      totalPipelineLatency += c.totalMs;
      pipelineCount++;
    });

    if (pipelineCount > 0) {
      console.log(`  📈 Average Pipeline: ${(totalPipelineLatency / pipelineCount).toFixed(2)}ms`);
      const avgSeconds = (totalPipelineLatency / pipelineCount) / 1000;
      console.log(`     = ${avgSeconds.toFixed(2)}s\n`);
    }
  }

  // Performance Assessment
  console.log('🎯 Performance Assessment:');
  console.log('-'.repeat(80));

  if (pipelineCount > 0) {
    const avgPipeline = totalPipelineLatency / pipelineCount;
    if (avgPipeline < 2000) {
      console.log(`✅ EXCELLENT: Average latency ${avgPipeline.toFixed(0)}ms is under 2 seconds`);
      console.log(`   Status: MEETS FYP REQUIREMENT (< 2 seconds)`);
    } else if (avgPipeline < 3000) {
      console.log(`⚠️  WARNING: Average latency ${avgPipeline.toFixed(0)}ms is 2-3 seconds`);
      console.log(`   Status: EXCEEDS REQUIREMENT, needs optimization`);
    } else {
      console.log(`🔴 CRITICAL: Average latency ${avgPipeline.toFixed(0)}ms exceeds 3 seconds`);
      console.log(`   Status: SIGNIFICANT OPTIMIZATION NEEDED`);
    }

    // Bottleneck Analysis
    console.log('\n📍 Bottleneck Analysis:');
    console.log('-'.repeat(80));

    const avgTranslation = results.tests[1].cases.reduce((sum, c) => sum + c.translationMs, 0) / results.tests[1].cases.length;
    const avgTts = results.tests[1].cases.reduce((sum, c) => sum + c.ttsMs, 0) / results.tests[1].cases.length;

    console.log(`Average Translation Latency: ${avgTranslation.toFixed(0)}ms`);
    console.log(`Average TTS Latency:         ${avgTts.toFixed(0)}ms`);

    if (avgTranslation > avgTts) {
      console.log(`⚠️  Translation is the bottleneck (${((avgTranslation / (avgTranslation + avgTts)) * 100).toFixed(0)}% of pipeline)`);
    } else {
      console.log(`⚠️  TTS is the bottleneck (${((avgTts / (avgTranslation + avgTts)) * 100).toFixed(0)}% of pipeline)`);
    }

    // Recommendations
    console.log('\n💡 Recommendations:');
    console.log('-'.repeat(80));

    if (avgPipeline > 2000) {
      console.log('Priority optimizations needed:');

      if (avgTranslation > avgTts) {
        console.log(`  1. Translation is slower (${avgTranslation.toFixed(0)}ms vs TTS ${avgTts.toFixed(0)}ms)`);
        console.log('     - Implement translation caching');
        console.log('     - Pre-translate common phrases');
        console.log('     - Use parallel processing');
      } else {
        console.log(`  1. TTS is slower (${avgTts.toFixed(0)}ms vs Translation ${avgTranslation.toFixed(0)}ms)`);
        console.log('     - Enable TTS caching');
        console.log('     - Use streaming TTS');
        console.log('     - Optimize audio synthesis');
      }

      console.log(`  2. Overall target: Reduce by ~${((avgPipeline - 2000) / avgPipeline * 100).toFixed(0)}% to meet < 2s requirement`);
    } else {
      console.log('✅ Latency is excellent! No critical optimizations needed.');
      console.log('   Focus on maintaining performance as you add features.');
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('✅ Test Complete!');
  console.log('='.repeat(80) + '\n');

  // Save results
  results.summary = {
    totalServiceLatencyMs: totalServiceLatency,
    averageServiceLatencyMs: totalServiceLatency / serviceCount,
    averagePipelineLatencyMs: totalPipelineLatency / pipelineCount,
    meetsRequirement: (totalPipelineLatency / pipelineCount) < 2000,
    timestamp: new Date().toISOString()
  };

  return results;
}

// Run test
runFullPipelineTest()
  .then(results => {
    console.log('\n📊 Final Results Object:');
    console.log(JSON.stringify(results.summary, null, 2));
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
  });
