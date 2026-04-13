/**
 * TTS CHUNK HANDLER
 *
 * Real-world implementation in Socket.IO
 * How chunks are synthesized, tracked, and sent to frontend
 */

import { synthesizeSpeech } from '../services/tts.js';
import { smartChunkText } from '../utils/ttsChunkOptimizer.js';
import { ChunkTracker } from '../utils/chunkTracker.js';
import { synthesizeWithRetry, getValidationReport } from '../utils/chunkValidator.js';

/**
 * Main function: Handle TTS with chunking
 *
 * socket.on('translate-complete', async (data) => {
 *   await handleTtsWithChunking(io, socket, data);
 * });
 */
export async function handleTtsWithChunking(
  io,
  socket,
  {
    roomId,
    translatedText,
    targetLang,
    receiverSocketId,
  }
) {
  const userId = socket.data.userId;
  const localeMap = { EN: 'en-US', UR: 'ur-PK', AR: 'ar-SA' };
  const ttsLocale = localeMap[targetLang];

  console.log(
    `[TTS] User ${userId} → ${targetLang}: "${translatedText.substring(0, 50)}..."`
  );

  // Step 1: Decide chunking
  const textLength = translatedText.length;
  const shouldChunk = textLength > 100; // Chunk if > 100 chars

  if (!shouldChunk) {
    // SHORT TEXT - synthesize directly
    console.log(`[TTS] Short text (${textLength} chars), no chunking`);

    try {
      const startMs = Date.now();
      const audio = await synthesizeSpeech(translatedText, ttsLocale);
      const synthesisMs = Date.now() - startMs;

      // Send to receiver
      io.to(receiverSocketId).emit('tts-chunk', {
        chunkIndex: 0,
        audio,
        totalChunks: 1,
        isLast: true,
        synthesisMs,
        chunkText: translatedText,
      });

      console.log(`[TTS] Sent in ${synthesisMs}ms`);
    } catch (err) {
      console.error(`[TTS] Error:`, err.message);
      socket.emit('tts-error', { error: err.message });
    }

    return;
  }

  // LONG TEXT - use chunking!
  console.log(`[TTS] Long text (${textLength} chars), chunking into pieces`);

  const chunks = smartChunkText(translatedText, 100);
  console.log(`[TTS] Created ${chunks.length} chunks`);

  // Step 2: Create tracker
  const tracker = new ChunkTracker(chunks.length);

  // Step 3: Start ALL synthesis immediately (parallel) WITH RETRY + VALIDATION
  const synthesisPromises = chunks.map((chunk, idx) => {
    return synthesizeWithRetry(
      chunk,
      ttsLocale,
      synthesizeSpeech,
      { maxRetries: 3, retryDelayMs: 500 }
    )
      .then(result => {
        if (!result.valid) {
          // Synthesis failed after all retries
          console.error(`[TTS] Chunk ${idx} failed:`, result.error);
          tracker.markChunkFailed(idx, result.error);

          // Notify frontend of failure
          io.to(receiverSocketId).emit('tts-chunk-error', {
            chunkIndex: idx,
            error: result.error,
          });

          throw new Error(result.error);
        }

        const audio = result.audio;

        // Get validation report for logging
        const report = getValidationReport(audio, idx);
        console.log(`[TTS] Chunk ${idx}: ${report.status}`);

        // MARK AS READY (update tracker)
        tracker.markChunkReady(idx, audio, result.synthesisMs);

        // EMIT IMMEDIATELY (frontend receives as ready)
        io.to(receiverSocketId).emit('tts-chunk', {
          chunkIndex: idx,
          audio,
          totalChunks: chunks.length,
          isLast: idx === chunks.length - 1,
          chunkText: chunk,
          chunkSizeChars: chunk.length,
          synthesisMs: result.synthesisMs,
        });

        return audio;
      })
      .catch(err => {
        console.error(`[TTS] Chunk ${idx} permanently failed:`, err.message);
        tracker.markChunkFailed(idx, err.message);

        // Notify frontend
        io.to(receiverSocketId).emit('tts-chunk-error', {
          chunkIndex: idx,
          error: err.message,
        });

        throw err;
      });
  });

  // Step 4: Wait for all (but DON'T block - emissions already sent!)
  Promise.allSettled(synthesisPromises)
    .then(results => {
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      console.log(
        `[TTS] Synthesis complete: ${successful} successful, ${failed} failed`
      );

      // Print stats
      const stats = tracker.getStats();
      console.log(`[TTS] Stats:`, stats);

      // Notify frontend: all done!
      io.to(receiverSocketId).emit('tts-complete', {
        totalChunks: chunks.length,
        successfulChunks: successful,
        failedChunks: failed,
        totalSynthesisMs: Date.now() - tracker.startTime,
      });
    })
    .catch(err => {
      console.error(`[TTS] Critical error:`, err);
    });
}

/**
 * FRONTEND RECEIVES CHUNKS AND PLAYS THEM
 * This is what the frontend code looks like:
 *
 * socket.on('tts-chunk', ({ chunkIndex, audio, totalChunks, isLast }) => {
 *   // Store chunk
 *   receivedChunks[chunkIndex] = audio;
 *   console.log(`Got chunk ${chunkIndex}/${totalChunks}`);
 *
 *   // Check if we can start playing (have chunks 0, 1, 2... in order)
 *   for (let i = 0; i < totalChunks; i++) {
 *     if (!receivedChunks[i]) break; // Gap, stop here
 *
 *     if (i === 0) {
 *       // Start playing from first chunk!
 *       const orderedAudio = Object.keys(receivedChunks)
 *         .sort((a, b) => a - b)
 *         .map(idx => receivedChunks[idx])
 *         .join('');
 *
 *       playAudio(orderedAudio);
 *       break;
 *     }
 *   }
 *
 *   if (isLast) {
 *     // Last chunk sent, wait for all
 *     socket.once('tts-complete', () => {
 *       // All done!
 *     });
 *   }
 * });
 */

/**
 * EXAMPLE TIMELINE:
 *
 * Text: "Welcome to this meeting everyone. Please discuss important topics."
 * Chunks: 3 pieces (Chunk 0, 1, 2)
 *
 * Time  Event
 * ────────────────────────────────────────────────
 *   0ms  Start synthesis (all 3 parallel)
 * 200ms  Chunk 1 ready → EMIT → Frontend receives ✅
 * 250ms  Chunk 0 ready → EMIT → Frontend receives ✅
 * 300ms  Chunk 2 ready → EMIT → Frontend receives ✅
 *
 * Frontend playback:
 * 200ms  Got Chunk 1 (but waiting for 0)
 * 250ms  Got Chunk 0 → START PLAYING! User hears ✅
 * 300ms  Got Chunk 2 → Queue for playback
 *
 * Result: User hears first chunk in 250ms instead of waiting 300ms for all!
 */
