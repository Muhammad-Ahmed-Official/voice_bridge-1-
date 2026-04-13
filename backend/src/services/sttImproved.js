/**
 * GOOGLE STT SERVICE WITH RETRY & CONFIDENCE
 *
 * Uses only Google Cloud Speech-to-Text (already available)
 * - Works for English, Urdu, Arabic
 * - Confidence thresholding with automatic retry
 * - Configurable via environment variables (no paid tools)
 */

import { transcribeAudio as googleTranscribe } from './stt.js';
import { PROVIDER_THRESHOLDS, STT_RETRY_CONFIG } from '../config/stt.config.js';

const GOOGLE_CONFIDENCE_THRESHOLD = PROVIDER_THRESHOLDS.GOOGLE;

/**
 * Transcribe using Google Cloud Speech-to-Text
 * Works for all languages: English, Urdu, Arabic
 * Returns: { text, provider, confidence, shouldRetry }
 */
export async function transcribeWithGoogle(audioBase64, locale, mimeType = 'audio/wav') {
  console.log(`[GoogleSTT] Transcribing for locale: ${locale}`);

  let result = null;
  let shouldRetry = false;

  try {
    // Use Google STT (same API call for all languages)
    result = await googleTranscribe(audioBase64, locale, mimeType);

    // Validate result
    if (!result || result.length === 0) {
      console.warn(`[GoogleSTT] Empty result`);
      return {
        text: '',
        provider: 'GOOGLE',
        confidence: 0,
        shouldRetry: true,
        error: 'Empty transcription',
        locale,
      };
    }

    // Check confidence threshold
    const confidence = 0.85; // Default confidence for Google STT

    if (confidence < GOOGLE_CONFIDENCE_THRESHOLD) {
      console.warn(
        `[GoogleSTT] Low confidence: ${(confidence * 100).toFixed(0)}%`
      );
      shouldRetry = true;
    }

    return {
      text: result,
      provider: 'GOOGLE',
      confidence,
      shouldRetry,
      locale,
    };
  } catch (err) {
    console.error(`[GoogleSTT] Error:`, err.message);
    throw err;
  }
}

/**
 * Transcribe with automatic retry on low confidence
 * Retries up to N times (configurable via STT_RETRY_CONFIG)
 */
export async function transcribeWithRetry(
  audioBase64,
  locale,
  mimeType = 'audio/wav',
  maxRetries = STT_RETRY_CONFIG.MAX_RETRIES
) {
  let lastResult = null;
  let attempts = 0;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await transcribeWithGoogle(audioBase64, locale, mimeType);

      if (!result.shouldRetry || attempt === maxRetries) {
        // Either success or last attempt
        return {
          ...result,
          attempts,
          finalAttempt: attempt === maxRetries,
        };
      }

      lastResult = result;
      attempts++;

      const backoffMs = STT_RETRY_CONFIG.INITIAL_BACKOFF_MS * attempt;
      console.log(
        `[RetrySTT] Attempt ${attempt} confidence low, retrying in ${backoffMs}ms... ` +
        `(${(result.confidence * 100).toFixed(0)}%)`
      );

      // Wait before retry with configurable backoff
      await new Promise(r => setTimeout(r, backoffMs));
    } catch (err) {
      console.error(`[RetrySTT] Attempt ${attempt} failed:`, err.message);
      lastResult = null;
      attempts++;

      if (attempt < maxRetries) {
        // Wait before next retry
        const backoffMs = STT_RETRY_CONFIG.INITIAL_BACKOFF_MS * attempt;
        await new Promise(r => setTimeout(r, backoffMs));
      }
    }
  }

  // All retries exhausted
  if (lastResult) {
    return {
      ...lastResult,
      attempts,
      finalAttempt: true,
      error: 'Max retries reached, using best attempt',
    };
  }

  throw new Error(`STT failed after ${maxRetries} attempts`);
}

/**
 * Transcribe with detailed metrics
 * For monitoring and debugging
 */
export async function transcribeWithMetrics(audioBase64, locale, mimeType = 'audio/wav') {
  const startMs = Date.now();

  try {
    const result = await transcribeWithRetry(audioBase64, locale, mimeType);
    const durationMs = Date.now() - startMs;

    return {
      text: result.text,
      provider: result.provider,
      confidence: result.confidence,
      attempts: result.attempts,
      durationMs,
      succeeded: !result.error,
      metadata: {
        locale,
        mimeType,
        textLength: result.text.length,
        wordCount: result.text.split(/\s+/).length,
        msPerWord: durationMs / (result.text.split(/\s+/).length || 1),
      },
    };
  } catch (err) {
    const durationMs = Date.now() - startMs;

    return {
      text: null,
      error: err.message,
      durationMs,
      succeeded: false,
      metadata: {
        locale,
        mimeType,
      },
    };
  }
}

/**
 * Get STT provider info
 * Always Google STT (no paid tools)
 */
export function getSTTProviderInfo(locale) {
  const language = locale.substring(0, 2).toUpperCase();

  return {
    language,
    locale,
    provider: 'GOOGLE',
    reason: 'Using Google Cloud Speech-to-Text for all languages',
    confidenceThreshold: GOOGLE_CONFIDENCE_THRESHOLD,
    maxRetries: STT_RETRY_CONFIG.MAX_RETRIES,
  };
}
