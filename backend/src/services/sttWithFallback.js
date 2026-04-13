/**
 * STT WITH CONFIDENCE + FALLBACK UX
 *
 * Instead of trying to fix accuracy, provide better UX:
 * - Show confidence score
 * - Allow manual correction
 * - Show partial results
 * - Suggest speaking slower
 *
 * All thresholds are configurable via environment variables
 */

import { logger } from '../config/logger.js';
import { transcribeAudio } from './stt.js';
import {
  STT_CONFIDENCE_THRESHOLDS,
  LANGUAGE_CONFIG,
  TEXT_ANALYSIS_CONFIG,
  AUDIO_ANALYSIS_CONFIG,
  VALIDATION_WORDS,
} from '../config/stt.config.js';

/**
 * Transcribe with confidence scoring
 * Returns: { text, confidence, quality, suggestion }
 */
export async function transcribeWithConfidence(audioBase64, locale, mimeType = 'audio/wav') {
  try {
    const startMs = Date.now();
    const text = await transcribeAudio(audioBase64, locale, mimeType);
    const durationMs = Date.now() - startMs;

    // Estimate confidence based on:
    // - Text length (longer usually = higher confidence)
    // - Audio duration (audio quality indicator)
    // - Known phrases (if we recognize common patterns)

    let confidence = estimateConfidence(text, durationMs, locale);

    // Determine quality level based on configured thresholds
    let quality;
    let suggestion;

    if (confidence >= STT_CONFIDENCE_THRESHOLDS.HIGH) {
      quality = 'HIGH';
      suggestion = null;
    } else if (confidence >= STT_CONFIDENCE_THRESHOLDS.MEDIUM) {
      quality = 'MEDIUM';
      suggestion = 'This might be incorrect - you can correct it';
    } else if (confidence >= STT_CONFIDENCE_THRESHOLDS.LOW) {
      quality = 'LOW';
      suggestion = 'Low confidence. Try speaking more clearly or slowly';
    } else {
      quality = 'VERY_LOW';
      suggestion = 'Could not understand clearly. Please speak slower and enunciate';
    }

    return {
      text,
      confidence: Math.round(confidence * 100), // 0-100
      quality, // HIGH, MEDIUM, LOW, VERY_LOW
      suggestion,
      locale,
      durationMs,
      canCorrect: true, // User can manually correct
    };
  } catch (err) {
    logger.error('STT Confidence', `Error: ${err.message}`);

    return {
      text: '',
      confidence: 0,
      quality: 'ERROR',
      suggestion: 'Speech not recognized. Please try again',
      error: err.message,
      canCorrect: false,
    };
  }
}

/**
 * Estimate confidence based on transcription quality indicators
 * All thresholds loaded from config (not hardcoded)
 */
function estimateConfidence(text, durationMs, locale) {
  if (!text || text.length === 0) {
    return 0.1; // Very low if empty
  }

  let confidence = 0.5; // Start at 50%

  // Determine language from locale
  const language = locale.substring(0, 2).toUpperCase();
  const langConfig = LANGUAGE_CONFIG[language === 'UR' ? 'URDU' : language === 'AR' ? 'ARABIC' : 'ENGLISH'];

  // Text length indicator (configurable)
  const textLength = text.length;
  if (textLength < TEXT_ANALYSIS_CONFIG.MIN_LENGTH_ACCEPTABLE) {
    confidence -= 0.2; // Too short = likely wrong
  } else if (textLength > TEXT_ANALYSIS_CONFIG.LENGTH_BONUS_THRESHOLD) {
    confidence += TEXT_ANALYSIS_CONFIG.LENGTH_CONFIDENCE_BONUS; // Longer text = higher confidence
  } else if (textLength > TEXT_ANALYSIS_CONFIG.MIN_LENGTH_FOR_HIGH_CONFIDENCE) {
    confidence += 0.1;
  }

  // Duration indicator (for audio quality) - configurable
  const estimatedSpeechDuration = (textLength / AUDIO_ANALYSIS_CONFIG.NORMAL_CHARS_PER_SECOND);
  const durationRatio = durationMs / (estimatedSpeechDuration * 1000);

  if (durationRatio < AUDIO_ANALYSIS_CONFIG.RUSHED_RATIO_THRESHOLD) {
    // Audio seems rushed
    confidence += AUDIO_ANALYSIS_CONFIG.RUSHED_PENALTY;
  } else if (durationRatio > AUDIO_ANALYSIS_CONFIG.CLEAR_RATIO_THRESHOLD) {
    // Audio seems very slow/clear
    confidence += AUDIO_ANALYSIS_CONFIG.CLEAR_BONUS;
  }

  // Language-specific adjustments (configurable)
  if (langConfig && langConfig.confidenceAdjustment) {
    confidence += langConfig.confidenceAdjustment;

    // Optional validation for Urdu/Arabic (if enabled)
    if (langConfig.enableValidation && hasValidationWords(text, language)) {
      confidence += 0.2; // Boost for recognized words
    }
  }

  // Sanity check
  return Math.max(0, Math.min(1, confidence));
}

/**
 * Check if text contains validation words
 * Words loaded from configuration (Urdu, Arabic, English - handles code-switching)
 * Case-insensitive for English words, case-sensitive for Urdu/Arabic
 */
function hasValidationWords(text, language) {
  // Get words from config (includes proper Urdu + common English code-switching)
  let words = [];

  if (language === 'UR') {
    words = Array.isArray(VALIDATION_WORDS.URDU)
      ? VALIDATION_WORDS.URDU
      : [];
  } else if (language === 'AR') {
    words = Array.isArray(VALIDATION_WORDS.ARABIC)
      ? VALIDATION_WORDS.ARABIC
      : [];
  }

  // If no words configured, skip validation
  if (!words || words.length === 0) {
    return false;
  }

  // Check if any word appears in text
  // English words: case-insensitive
  // Urdu/Arabic: case-sensitive
  const textLower = text.toLowerCase();

  return words.some(word => {
    const wordLower = word.toLowerCase();
    // Simple substring match (good enough for validation)
    return textLower.includes(wordLower);
  });
}

/**
 * Format response for frontend
 * Includes visual indicators and suggestions
 */
export function formatSTTResponse(sttResult, isCorrection = false) {
  const { text, confidence, quality, suggestion, canCorrect } = sttResult;

  // Visual indicators
  let icon;
  let color;

  switch (quality) {
    case 'HIGH':
      icon = '✅';
      color = 'green';
      break;
    case 'MEDIUM':
      icon = '⚠️';
      color = 'yellow';
      break;
    case 'LOW':
      icon = '⚠️⚠️';
      color = 'orange';
      break;
    case 'VERY_LOW':
      icon = '❌';
      color = 'red';
      break;
    default:
      icon = '❓';
      color = 'gray';
  }

  return {
    text,
    confidence,
    quality,
    icon,
    color,
    suggestion,
    canCorrect,
    isCorrection,
    actions: {
      canEdit: true, // User can edit manually
      canRepeat: true, // User can repeat
      canCorrect: canCorrect, // System suggests correction
    },
  };
}

/**
 * Apply manual correction from user
 */
export function applyCorrectionFromUser(originalResult, correctedText) {
  return {
    ...originalResult,
    text: correctedText,
    confidence: 100, // User-corrected = 100% confidence
    quality: 'USER_CORRECTED',
    isCorrection: true,
    suggestion: null,
  };
}

/**
 * Suggest when to retry
 */
export function shouldSuggestRetry(sttResult) {
  if (sttResult.quality === 'VERY_LOW' || sttResult.quality === 'LOW') {
    return {
      shouldRetry: true,
      reason: sttResult.suggestion,
      tips: [
        '🎤 Speak clearly and slowly',
        '🔇 Reduce background noise',
        '📱 Hold phone closer to mouth',
        '⏰ Pause between phrases',
      ],
    };
  }

  return { shouldRetry: false };
}

/**
 * Batch processing with confidence tracking
 */
export async function transcribeAudioBatch(
  audioChunks,
  locale,
  mimeType = 'audio/wav'
) {
  const results = [];
  const stats = {
    total: audioChunks.length,
    highConfidence: 0,
    mediumConfidence: 0,
    lowConfidence: 0,
    veryLowConfidence: 0,
  };

  for (let i = 0; i < audioChunks.length; i++) {
    try {
      const result = await transcribeWithConfidence(
        audioChunks[i],
        locale,
        mimeType
      );

      results.push({
        index: i,
        ...result,
      });

      // Track statistics
      if (result.quality === 'HIGH') stats.highConfidence++;
      else if (result.quality === 'MEDIUM') stats.mediumConfidence++;
      else if (result.quality === 'LOW') stats.lowConfidence++;
      else if (result.quality === 'VERY_LOW') stats.veryLowConfidence++;
    } catch (err) {
      results.push({
        index: i,
        error: err.message,
        text: '',
        confidence: 0,
      });

      stats.veryLowConfidence++;
    }
  }

  // Calculate overall quality
  const avgConfidence =
    results
      .filter(r => !r.error)
      .reduce((sum, r) => sum + (r.confidence || 0), 0) /
    Math.max(results.filter(r => !r.error).length, 1);

  return {
    results,
    stats: {
      ...stats,
      avgConfidence: Math.round(avgConfidence),
      successRate: Math.round(
        ((stats.total - (stats.total - results.filter(r => !r.error).length)) /
          stats.total) *
          100
      ),
    },
  };
}
