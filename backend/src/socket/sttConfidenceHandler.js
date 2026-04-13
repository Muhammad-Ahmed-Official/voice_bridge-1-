/**
 * STT CONFIDENCE SCORE - SIMPLE
 *
 * Just emit: text + confidence (0-100)
 * User sees it. If wrong, they retry next time. That's it.
 */

import { transcribeWithConfidence } from '../services/sttWithFallback.js';

/**
 * Transcribe and send confidence score
 * No UI, no buttons, no suggestions
 * Just text + confidence (0-100)
 */
export async function emitSTTWithScore(
  socket,
  audioBase64,
  locale,
  mimeType = 'audio/wav'
) {
  try {
    const result = await transcribeWithConfidence(audioBase64, locale, mimeType);

    socket.emit('stt-result', {
      text: result.text,
      confidence: result.confidence,
      locale,
      timestamp: Date.now(),
    });

    console.log(`[STT] "${result.text}" | ${result.confidence}% confidence`);

    return result;
  } catch (err) {
    console.error('[STT Error]', err.message);
    socket.emit('stt-error', {
      error: err.message,
      timestamp: Date.now(),
    });
    throw err;
  }
}

export default { emitSTTWithScore };
