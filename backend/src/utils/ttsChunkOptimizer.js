/**
 * TTS CHUNK OPTIMIZER
 *
 * Masla: Lamba text slow hota hai
 * Solution: Chhote pieces mein kata, saath synthesize karo
 * Result: User faster sune!
 */

/**
 * Text ko chunks mein kato (smart way)
 * - Sentences par kato (agar possible ho)
 * - Otherwise character count par
 */
export function smartChunkText(text, maxCharsPerChunk = 100) {
  if (!text || text.length <= maxCharsPerChunk) {
    return [text];
  }

  const chunks = [];

  // Pehle sentences par try karo
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

  let currentChunk = '';

  for (const sentence of sentences) {
    const trimmedSentence = sentence.trim();

    // Agar yeh sentence pehle se <= max size
    if (trimmedSentence.length <= maxCharsPerChunk) {
      if ((currentChunk + ' ' + trimmedSentence).length <= maxCharsPerChunk) {
        // Combine with current chunk
        currentChunk += (currentChunk ? ' ' : '') + trimmedSentence;
      } else {
        // Current chunk full hai, save karo
        if (currentChunk) chunks.push(currentChunk);
        currentChunk = trimmedSentence;
      }
    } else {
      // Sentence bahut lamba hai, manually split karo
      if (currentChunk) chunks.push(currentChunk);

      // Sentence ko words mein split karo
      const words = trimmedSentence.split(/\s+/);
      let wordChunk = '';

      for (const word of words) {
        if ((wordChunk + ' ' + word).length <= maxCharsPerChunk) {
          wordChunk += (wordChunk ? ' ' : '') + word;
        } else {
          if (wordChunk) chunks.push(wordChunk);
          wordChunk = word;
        }
      }

      if (wordChunk) chunks.push(wordChunk);
      currentChunk = '';
    }
  }

  if (currentChunk) chunks.push(currentChunk);

  return chunks.filter(c => c.trim().length > 0);
}

/**
 * Analyze text to decide chunking strategy
 */
export function analyzeTextComplexity(text) {
  const length = text.length;
  const wordCount = text.split(/\s+/).length;
  const sentenceCount = (text.match(/[.!?]/g) || []).length;

  return {
    length,
    wordCount,
    sentenceCount,
    avgWordsPerSentence: sentenceCount > 0 ? wordCount / sentenceCount : wordCount,
    isComplex: length > 150, // > 150 chars = complex
    recommendChunking: length > 100, // Chunk if > 100 chars
  };
}

/**
 * Synthesize text with smart chunking
 *
 * Usage:
 * const { audio, metadata } = await synthesizeWithChunking(
 *   "Long text here...",
 *   "en-US",
 *   synthesizeSpeech  // TTS function
 * );
 */
export async function synthesizeWithChunking(
  text,
  locale,
  synthesizeFn,
  options = {}
) {
  const {
    maxCharsPerChunk = 100,
    enableChunking = true,
  } = options;

  // Analyze text
  const complexity = analyzeTextComplexity(text);

  // Decide: chunk ya nahi?
  const shouldChunk = enableChunking && complexity.recommendChunking;

  if (!shouldChunk) {
    // Chhota text, direct synthesize
    const audio = await synthesizeFn(text, locale);
    return {
      audio,
      chunks: [text],
      metadata: {
        totalChunks: 1,
        synthesis: 'single',
        complexity,
      },
    };
  }

  // Lamba text, chunk it!
  const chunks = smartChunkText(text, maxCharsPerChunk);

  // Synthesize all chunks in parallel
  const startTime = Date.now();
  const audioChunks = await Promise.all(
    chunks.map(chunk => synthesizeFn(chunk, locale))
  );
  const synthesisTimeMs = Date.now() - startTime;

  // Combine audio chunks (simple concatenation)
  // In production, might want to blend audio for smoother transition
  const combinedAudio = audioChunks.join('');

  return {
    audio: combinedAudio,
    chunks,
    metadata: {
      totalChunks: chunks.length,
      synthesis: 'chunked',
      chunkSizes: chunks.map(c => c.length),
      synthesisTimeMs,
      avgTimePerChunk: synthesisTimeMs / chunks.length,
      complexity,
      estimatedSpeedup: complexity.length > 100
        ? `${(complexity.length / 100).toFixed(1)}x faster with chunking`
        : 'No significant speedup',
    },
  };
}

/**
 * Streaming version - emit chunks as they synthesize
 * User hears first chunk ASAP
 */
export async function synthesizeWithStreaming(
  text,
  locale,
  synthesizeFn,
  onChunkReady, // Callback: (audioChunk, chunkIndex) => {}
  options = {}
) {
  const {
    maxCharsPerChunk = 100,
  } = options;

  const complexity = analyzeTextComplexity(text);
  const shouldChunk = complexity.recommendChunking;

  if (!shouldChunk) {
    // Single chunk, emit immediately
    const audio = await synthesizeFn(text, locale);
    onChunkReady?.(audio, 0);
    return {
      audio,
      chunks: [text],
      metadata: { totalChunks: 1, synthesis: 'single' },
    };
  }

  // Chunk and stream
  const chunks = smartChunkText(text, maxCharsPerChunk);
  const audioChunks = [];

  // Fire all synthesis calls immediately (don't wait)
  const synthesisPromises = chunks.map(async (chunk, idx) => {
    const audio = await synthesizeFn(chunk, locale);
    audioChunks[idx] = audio;
    // Emit as ready (even if earlier chunks not done yet)
    onChunkReady?.(audio, idx);
    return audio;
  });

  // Wait for all synthesis
  await Promise.all(synthesisPromises);

  return {
    audio: audioChunks.join(''),
    chunks,
    metadata: {
      totalChunks: chunks.length,
      synthesis: 'streamed',
      chunkSizes: chunks.map(c => c.length),
    },
  };
}

/**
 * Debug: Show chunking breakdown
 */
export function debugChunking(text, maxCharsPerChunk = 100) {
  const chunks = smartChunkText(text, maxCharsPerChunk);

  console.log('\n📦 CHUNKING BREAKDOWN:');
  console.log(`Original text: ${text.length} characters`);
  console.log(`Total chunks: ${chunks.length}`);
  console.log(`Max chars per chunk: ${maxCharsPerChunk}\n`);

  chunks.forEach((chunk, idx) => {
    console.log(`Chunk ${idx + 1} (${chunk.length} chars):`);
    console.log(`  "${chunk.substring(0, 50)}${chunk.length > 50 ? '...' : ''}"`);
  });

  console.log('');
  return chunks;
}
