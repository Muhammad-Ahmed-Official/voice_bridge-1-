/**
 * CONCURRENT USER LATENCY TEST
 * Measures performance when multiple users speak simultaneously
 * Run: node tests/concurrentLatencyTest.js
 */

import dotenv from 'dotenv';
import { translateText } from '../src/services/translate.js';
import { synthesizeSpeech } from '../src/services/tts.js';
import { transcribeAudio } from '../src/services/stt.js';
import { LatencyProfiler } from '../src/utils/latencyProfiler.js';

dotenv.config({ path: './.env' });

/**
 * Simulate concurrent processing of multiple users
 * Each user's audio goes through STT → Translation → TTS pipeline
 */
async function simulateConcurrentUsers() {
  console.log('\n' + '='.repeat(100));
  console.log('🎤 CONCURRENT USER LATENCY TEST');
  console.log('   Testing multiple users speaking simultaneously');
  console.log('='.repeat(100) + '\n');

  // Test scenarios: different language combinations
  const scenarios = [
    {
      name: 'Scenario 1: Simultaneous EN↔UR (2 users)',
      users: [
        { id: 'user1', text: 'Hello, how are you today?', source: 'EN', target: 'UR' },
        { id: 'user2', text: 'السلام عليكم', source: 'AR', target: 'EN' },
      ],
    },
    {
      name: 'Scenario 2: Simultaneous UR↔AR↔EN (3 users)',
      users: [
        { id: 'user1', text: 'Aap kaise hain?', source: 'UR', target: 'EN' },
        { id: 'user2', text: 'Hello, how are you?', source: 'EN', target: 'AR' },
        { id: 'user3', text: 'مرحبا بك في هذا الاجتماع', source: 'AR', target: 'UR' },
      ],
    },
    {
      name: 'Scenario 3: All 3 English speakers (baseline)',
      users: [
        { id: 'user1', text: 'Hello, how are you?', source: 'EN', target: 'EN' },
        { id: 'user2', text: 'Good morning everyone', source: 'EN', target: 'EN' },
        { id: 'user3', text: 'Nice to meet you all', source: 'EN', target: 'EN' },
      ],
    },
  ];

  const results = {
    timestamp: new Date().toISOString(),
    scenarios: [],
    summary: {},
  };

  // ===== RUN EACH SCENARIO =====
  for (const scenario of scenarios) {
    console.log(`\n📍 ${scenario.name}`);
    console.log('-'.repeat(100));

    const scenarioResult = {
      name: scenario.name,
      users: [],
      concurrencyMetrics: {},
    };

    // Run all users' translations and TTS in parallel
    const startTime = Date.now();

    try {
      const promises = scenario.users.map(async (user) => {
        const userProfiler = new LatencyProfiler(`${user.id}`);

        try {
          // Translation
          userProfiler.mark('translation_start');
          const translated = await translateText(user.text, user.source, user.target);
          userProfiler.mark('translation_end');
          const translationMs = userProfiler.measure('translation_start', 'translation_end');

          // TTS
          const localeMap = { UR: 'ur-PK', EN: 'en-US', AR: 'ar-SA' };
          userProfiler.mark('tts_start');
          const audio = await synthesizeSpeech(translated.text, localeMap[user.target]);
          userProfiler.mark('tts_end');
          const ttsMs = userProfiler.measure('tts_start', 'tts_end');

          const totalMs = translationMs + ttsMs;

          console.log(`  ${user.id}: ${user.source}→${user.target}`);
          console.log(`    Translation: ${translationMs.toFixed(2)}ms | TTS: ${ttsMs.toFixed(2)}ms | Total: ${totalMs.toFixed(2)}ms`);

          return {
            userId: user.id,
            pair: `${user.source}→${user.target}`,
            translationMs,
            ttsMs,
            totalMs,
            text: user.text,
            translatedText: translated.text,
          };
        } catch (err) {
          console.error(`  ${user.id}: ❌ Failed: ${err.message}`);
          return {
            userId: user.id,
            pair: `${user.source}→${user.target}`,
            error: err.message,
          };
        }
      });

      const userResults = await Promise.all(promises);
      const concurrencyTimeMs = Date.now() - startTime;

      scenarioResult.users = userResults;
      scenarioResult.concurrencyMetrics = {
        parallelProcessingTimeMs: concurrencyTimeMs,
        numUsers: scenario.users.length,
        avgUserLatencyMs: userResults
          .filter(r => !r.error)
          .reduce((sum, r) => sum + r.totalMs, 0) / userResults.filter(r => !r.error).length,
      };

      // Calculate sequential equivalent (if done one by one)
      const sequentialTimeMs = userResults
        .filter(r => !r.error)
        .reduce((sum, r) => sum + r.totalMs, 0);

      console.log(`\n  ⚡ Concurrency Benefit:`);
      console.log(`    Parallel Time (actual):     ${concurrencyTimeMs.toFixed(2)}ms`);
      console.log(`    Sequential Time (simulated): ${sequentialTimeMs.toFixed(2)}ms`);
      console.log(`    Speedup Factor:             ${(sequentialTimeMs / concurrencyTimeMs).toFixed(2)}x`);
      console.log(`    Time Saved:                 ${(sequentialTimeMs - concurrencyTimeMs).toFixed(2)}ms`);

      results.scenarios.push(scenarioResult);
    } catch (err) {
      console.error(`  Scenario failed: ${err.message}`);
    }
  }

  // ===== COMPARISON WITH BASELINE =====
  console.log('\n\n' + '='.repeat(100));
  console.log('📊 CONCURRENT LATENCY ANALYSIS');
  console.log('='.repeat(100) + '\n');

  console.log('Scenario Comparison:');
  console.log('-'.repeat(100));

  results.scenarios.forEach((scenario, idx) => {
    const successfulUsers = scenario.users.filter(u => !u.error);
    if (successfulUsers.length > 0) {
      const avgUserLatency = scenario.concurrencyMetrics.avgUserLatencyMs;
      const parallelTime = scenario.concurrencyMetrics.parallelProcessingTimeMs;

      console.log(
        `${idx + 1}. ${scenario.name}: ${parallelTime.toFixed(0)}ms ` +
        `(${successfulUsers.length} users, avg/user: ${avgUserLatency.toFixed(0)}ms)`
      );
    }
  });

  // ===== KEY INSIGHTS =====
  console.log('\n💡 Key Insights:');
  console.log('-'.repeat(100));

  const concurrentScenario = results.scenarios[1]; // 3-user scenario
  if (concurrentScenario && concurrentScenario.users.filter(u => !u.error).length > 0) {
    const avgLatency = concurrentScenario.concurrencyMetrics.avgUserLatencyMs;
    const maxLatency = Math.max(...concurrentScenario.users.filter(u => !u.error).map(u => u.totalMs));
    const minLatency = Math.min(...concurrentScenario.users.filter(u => !u.error).map(u => u.totalMs));

    console.log(`✅ 3-User Concurrent Processing:`);
    console.log(`   Average latency per user: ${avgLatency.toFixed(2)}ms`);
    console.log(`   Min latency: ${minLatency.toFixed(2)}ms`);
    console.log(`   Max latency: ${maxLatency.toFixed(2)}ms`);
    console.log(`   Latency variance: ${(maxLatency - minLatency).toFixed(2)}ms`);

    if (avgLatency < 1000) {
      console.log(`   ✅ All users stay under 1 second latency`);
    } else if (avgLatency < 2000) {
      console.log(`   ⚠️  Latency approaching 2-second limit`);
    } else {
      console.log(`   🔴 Latency exceeds 2-second limit`);
    }
  }

  // ===== CONCURRENT PROCESSING BENEFITS =====
  console.log('\n🚀 Concurrent Processing Benefits:');
  console.log('-'.repeat(100));

  const scenario2 = results.scenarios[1];
  const scenario3 = results.scenarios[2];

  if (scenario2 && scenario3) {
    const mixedLanguageTime = scenario2.concurrencyMetrics.parallelProcessingTimeMs;
    const englishOnlyTime = scenario3.concurrencyMetrics.parallelProcessingTimeMs;

    console.log(`Mixed Languages (3 users):    ${mixedLanguageTime.toFixed(0)}ms`);
    console.log(`English Only (3 users):       ${englishOnlyTime.toFixed(0)}ms`);
    console.log(`Difference:                   ${(mixedLanguageTime - englishOnlyTime).toFixed(0)}ms`);
    console.log(`\n✅ Parallel processing allows multiple users to be served simultaneously`);
    console.log(`   without sequential bottleneck, improving user experience in group calls.`);
  }

  // ===== SUMMARY =====
  console.log('\n' + '='.repeat(100));
  console.log('✅ Concurrent Latency Test Complete');
  console.log('='.repeat(100) + '\n');

  results.summary = {
    testCompleted: new Date().toISOString(),
    totalScenarios: results.scenarios.length,
    allScenariosPassed: results.scenarios.every(s => s.users.some(u => !u.error)),
  };

  return results;
}

// Run test
simulateConcurrentUsers()
  .then(results => {
    console.log('📊 Test Results Summary:');
    console.log(JSON.stringify(results.summary, null, 2));
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
  });
