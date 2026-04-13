/**
 * TASK 1.3b: TEXT LENGTH OPTIMIZATION TEST
 *
 * Dekho text ki length latency ko kaise affect karta hai
 * Chhota text = fast TTS
 * Lamba text = slow TTS
 *
 * Run: node tests/textLengthLatencyTest.js
 */

import dotenv from 'dotenv';
import { translateText } from '../src/services/translate.js';
import { synthesizeSpeech } from '../src/services/tts.js';
import { LatencyProfiler } from '../src/utils/latencyProfiler.js';

dotenv.config({ path: './.env' });

/**
 * Test different text lengths across all 3 languages
 * Dekho ke latency kaise badhta hai jaise text lamba hota hai
 */
async function testVariableTextLength() {
  console.log('\n' + '='.repeat(100));
  console.log('📝 TEXT LENGTH LATENCY OPTIMIZATION TEST');
  console.log('   Chhota text vs lamba text - latency comparison');
  console.log('='.repeat(100) + '\n');

  // Test data: alag alag lengths ke texts
  const testCases = [
    {
      name: 'VERY SHORT (1-5 words)',
      texts: {
        EN: 'Hi there',
        UR: 'السلام',
        AR: 'مرحبا',
      },
      lengthCategory: 'VERY_SHORT',
    },
    {
      name: 'SHORT (5-15 words)',
      texts: {
        EN: 'Good morning, how are you today',
        UR: 'السلام عليكم، كيف حالك؟',
        AR: 'صباح الخير، كيف حالك؟',
      },
      lengthCategory: 'SHORT',
    },
    {
      name: 'MEDIUM (15-30 words)',
      texts: {
        EN: 'Hello everyone, I hope you are having a wonderful day today and everything is going well',
        UR: 'میں امید ہوں کہ آپ سب خیر سے ہیں اور یہ میٹنگ اچھی طرح چل رہی ہے',
        AR: 'أتمنى أن تكونوا في أحسن صحة وحال. كيف تسير أعمالكم اليوم؟',
      },
      lengthCategory: 'MEDIUM',
    },
    {
      name: 'LONG (30+ words)',
      texts: {
        EN: 'Welcome to this meeting everyone. I am very pleased to see all of you here today. I hope everyone is having a great day and is ready to discuss our important topics and objectives',
        UR: 'اس میٹنگ میں سب کا خوش آمدید ہے۔ مجھے یہ دیکھ کر خوشی ہے کہ آپ سب یہاں موجود ہیں۔ میں امید کرتا ہوں کہ سب اہم موضوعات پر بحث کرنے کے لیے تیار ہیں',
        AR: 'أهلا وسهلا بالجميع في هذا الاجتماع المهم. يسعدني حقا رؤية كل واحد منكم هنا اليوم. آمل أن تكونوا مستعدين لمناقشة المواضيع المهمة والأهداف الحالية',
      },
      lengthCategory: 'LONG',
    },
  ];

  const results = {
    timestamp: new Date().toISOString(),
    lengthTests: [],
    summary: {},
  };

  // ===== RUN TESTS FOR EACH LENGTH CATEGORY =====
  for (const testCase of testCases) {
    console.log(`\n📍 ${testCase.name}`);
    console.log('-'.repeat(100));

    const lengthResult = {
      category: testCase.lengthCategory,
      name: testCase.name,
      languages: {},
    };

    // Test each language
    const languagePair = [
      { lang: 'EN', text: testCase.texts.EN },
      { lang: 'UR', text: testCase.texts.UR },
      { lang: 'AR', text: testCase.texts.AR },
    ];

    for (const { lang, text } of languagePair) {
      const profiler = new LatencyProfiler(`TTS_${lang}`);

      try {
        const localeMap = { EN: 'en-US', UR: 'ur-PK', AR: 'ar-SA' };

        // Text properties
        const textLength = text.length;
        const wordCount = text.split(/\s+/).length;

        // Measure TTS latency
        profiler.mark('tts_start');
        const audio = await synthesizeSpeech(text, localeMap[lang]);
        profiler.mark('tts_end');

        const ttsLatencyMs = profiler.measure('tts_start', 'tts_end');

        console.log(`  ${lang}: ${textLength} chars, ${wordCount} words`);
        console.log(`    TTS Latency: ${ttsLatencyMs.toFixed(2)}ms`);
        console.log(`    ⚡ Time per character: ${(ttsLatencyMs / textLength).toFixed(2)}ms/char`);
        console.log(`    ⚡ Time per word: ${(ttsLatencyMs / wordCount).toFixed(2)}ms/word`);

        lengthResult.languages[lang] = {
          text,
          textLength,
          wordCount,
          ttsLatencyMs,
          timePerCharacter: ttsLatencyMs / textLength,
          timePerWord: ttsLatencyMs / wordCount,
        };
      } catch (err) {
        console.error(`  ${lang}: ❌ Failed: ${err.message}`);
        lengthResult.languages[lang] = { error: err.message };
      }
    }

    results.lengthTests.push(lengthResult);
  }

  // ===== ANALYSIS =====
  console.log('\n\n' + '='.repeat(100));
  console.log('📊 TEXT LENGTH ANALYSIS');
  console.log('='.repeat(100) + '\n');

  // Build comparison table
  console.log('Latency by Text Length (All Languages):');
  console.log('-'.repeat(100));

  const categories = {};
  results.lengthTests.forEach(test => {
    const avgLatency =
      Object.values(test.languages)
        .filter(l => !l.error)
        .reduce((sum, l) => sum + l.ttsLatencyMs, 0) /
      Object.values(test.languages).filter(l => !l.error).length;

    const avgTextLength =
      Object.values(test.languages)
        .filter(l => !l.error)
        .reduce((sum, l) => sum + l.textLength, 0) /
      Object.values(test.languages).filter(l => !l.error).length;

    categories[test.category] = {
      name: test.name,
      avgLatency,
      avgTextLength,
      latencyPerChar: avgLatency / avgTextLength,
    };

    console.log(`${test.category.padEnd(12)} | Length: ${Math.round(avgTextLength).toString().padEnd(5)} chars | Latency: ${avgLatency.toFixed(0).padEnd(4)}ms | Per-Char: ${(avgLatency / avgTextLength).toFixed(2)}ms`);
  });

  // ===== KEY INSIGHTS =====
  console.log('\n💡 Key Insights:');
  console.log('-'.repeat(100));

  const short = categories['SHORT']?.avgLatency || 0;
  const long = categories['LONG']?.avgLatency || 0;
  const increase = ((long - short) / short) * 100;

  console.log(`Short text (5-15 words):  ~${short.toFixed(0)}ms`);
  console.log(`Long text (30+ words):    ~${long.toFixed(0)}ms`);
  console.log(`Increase:                 ${increase.toFixed(0)}% slower\n`);

  if (increase < 50) {
    console.log(`✅ Text length has MINIMAL impact on latency`);
    console.log(`   → No optimization needed for length variation`);
  } else if (increase < 100) {
    console.log(`⚠️  Text length has MODERATE impact (~${increase.toFixed(0)}% slower for long text)`);
    console.log(`   → Could benefit from chunking optimization`);
  } else {
    console.log(`🔴 Text length has SIGNIFICANT impact (${increase.toFixed(0)}% slower)`);
    console.log(`   → MUST implement chunking strategy`);
  }

  // ===== CHUNKING RECOMMENDATION =====
  console.log('\n📦 Chunking Strategy (if needed):');
  console.log('-'.repeat(100));

  if (long > 1500) {
    console.log(`Long text takes ${long.toFixed(0)}ms - consider splitting into chunks:`);
    console.log(`\nExample: Break "I hope everyone is having a wonderful day" into:`);
    console.log(`  Chunk 1: "I hope everyone is having"        → ~200ms`);
    console.log(`  Chunk 2: "a wonderful day"                   → ~150ms`);
    console.log(`  ─────────────────────────────────────────────────`);
    console.log(`  Total: ~350ms (vs ${long.toFixed(0)}ms original)\n`);

    console.log(`Benefits:`);
    console.log(`  1. User hears first chunk FASTER → perceived latency much lower`);
    console.log(`  2. Can start playback while generating remaining chunks`);
    console.log(`  3. Streaming effect → feels more natural\n`);

    console.log(`Implementation:`);
    console.log(`  const CHUNK_SIZE = 100; // characters`);
    console.log(`  const chunks = text.match(new RegExp('.{1,' + CHUNK_SIZE + '}', 'g'));`);
    console.log(`  await Promise.all(chunks.map(chunk => synthesizeSpeech(chunk)));`);
  } else {
    console.log(`✅ Text length impact is acceptable (max ${long.toFixed(0)}ms)`);
    console.log(`   → No chunking needed\n`);
  }

  // ===== LANGUAGE COMPARISON =====
  console.log('\n🌐 Language-Specific Performance:');
  console.log('-'.repeat(100));

  const langStats = {};
  results.lengthTests.forEach(test => {
    Object.entries(test.languages).forEach(([lang, data]) => {
      if (!data.error) {
        if (!langStats[lang]) {
          langStats[lang] = { latencies: [], textLengths: [] };
        }
        langStats[lang].latencies.push(data.ttsLatencyMs);
        langStats[lang].textLengths.push(data.textLength);
      }
    });
  });

  Object.entries(langStats).forEach(([lang, stats]) => {
    const avgLatency = stats.latencies.reduce((a, b) => a + b) / stats.latencies.length;
    const maxLatency = Math.max(...stats.latencies);
    const minLatency = Math.min(...stats.latencies);

    console.log(`${lang}:  Min: ${minLatency.toFixed(0)}ms | Avg: ${avgLatency.toFixed(0)}ms | Max: ${maxLatency.toFixed(0)}ms`);
  });

  // ===== SUMMARY =====
  console.log('\n' + '='.repeat(100));
  console.log('✅ Text Length Test Complete');
  console.log('='.repeat(100) + '\n');

  results.summary = {
    testCompleted: new Date().toISOString(),
    shortTextLatency: categories['SHORT']?.avgLatency || 0,
    longTextLatency: categories['LONG']?.avgLatency || 0,
    chunkingRequired: (long > 1500),
    recommendation: long > 1500 ? 'IMPLEMENT_CHUNKING' : 'NO_OPTIMIZATION_NEEDED',
  };

  return results;
}

// Run test
testVariableTextLength()
  .then(results => {
    console.log('📊 Summary:');
    console.log(JSON.stringify(results.summary, null, 2));
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
  });
