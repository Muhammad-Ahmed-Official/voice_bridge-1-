/**
 * CHUNK VALIDATOR
 *
 * Validate that synthesized chunks are good quality
 * Check: valid audio, correct size, not corrupted
 */

/**
 * Validate synthesized audio chunk
 * Returns: { valid: boolean, errors: [], warnings: [] }
 */
export function validateAudioChunk(audio, chunkIndex, options = {}) {
  const {
    minSizeBytes = 100,        // Min 100 bytes
    maxSizeBytes = 500000,     // Max 500KB
    maxSizeKb = 500,
  } = options;

  const errors = [];
  const warnings = [];

  // Check 1: Exists?
  if (!audio) {
    errors.push('Audio is null or undefined');
    return { valid: false, errors, warnings };
  }

  // Check 2: Is string?
  if (typeof audio !== 'string') {
    errors.push(`Audio is not string, got ${typeof audio}`);
    return { valid: false, errors, warnings };
  }

  // Check 3: Not empty?
  if (audio.length === 0) {
    errors.push('Audio is empty string');
    return { valid: false, errors, warnings };
  }

  // Check 4: Valid base64?
  const base64Regex = /^[A-Za-z0-9+/=]*$/;
  if (!base64Regex.test(audio)) {
    errors.push('Audio contains invalid base64 characters');
    return { valid: false, errors, warnings };
  }

  // Check 5: Size reasonable?
  const audioSizeBytes = audio.length;
  const audioSizeKb = (audioSizeBytes / 1024).toFixed(2);

  if (audioSizeBytes < minSizeBytes) {
    errors.push(`Audio too small: ${audioSizeKb}KB (min: ${(minSizeBytes / 1024).toFixed(1)}KB)`);
  }

  if (audioSizeBytes > maxSizeBytes) {
    errors.push(`Audio too large: ${audioSizeKb}KB (max: ${maxSizeKb}KB)`);
  }

  // Check 6: Can decode?
  try {
    const decoded = atob(audio);
    if (decoded.length === 0) {
      errors.push('Decoded audio is empty');
    }

    // Check if it looks like audio (MP3 header: ID3 or FF FB or FF FA)
    const header = decoded.substring(0, 3);
    const hasId3 = header === 'ID3';
    const hasMp3Sync = decoded.charCodeAt(0) === 0xff;

    if (!hasId3 && !hasMp3Sync) {
      warnings.push('Audio may not be valid MP3 (missing ID3 or sync header)');
    }
  } catch (err) {
    errors.push(`Cannot decode base64: ${err.message}`);
  }

  const isValid = errors.length === 0;

  return {
    valid: isValid,
    errors,
    warnings,
    metadata: {
      chunkIndex,
      sizeBytes: audioSizeBytes,
      sizeKb: audioSizeKb,
      base64Length: audio.length,
    },
  };
}

/**
 * Validate chunk synthesis process
 * Call this after synthesis completes
 */
export async function validateChunkSynthesis(chunk, audio, metrics = {}) {
  const {
    synthesisTimeMs = 0,
    locale = 'unknown',
  } = metrics;

  const validation = validateAudioChunk(audio);

  // Additional synthesis-specific checks
  if (synthesisTimeMs < 50) {
    validation.warnings.push(`Very fast synthesis (${synthesisTimeMs}ms) - may be cached/incomplete`);
  }

  if (synthesisTimeMs > 10000) {
    validation.warnings.push(`Very slow synthesis (${synthesisTimeMs}ms) - network/API delay?`);
  }

  // Text length check
  const textLength = chunk.length;
  const msPerChar = synthesisTimeMs / textLength;

  if (msPerChar < 2) {
    validation.warnings.push(`Fast synthesis rate (${msPerChar.toFixed(1)}ms/char) - unusually fast`);
  }

  if (msPerChar > 50) {
    validation.warnings.push(`Slow synthesis rate (${msPerChar.toFixed(1)}ms/char) - API slow?`);
  }

  return {
    ...validation,
    synthesisMetrics: {
      chunk: chunk.substring(0, 50) + (chunk.length > 50 ? '...' : ''),
      textLengthChars: textLength,
      synthesisTimeMs,
      locale,
      msPerCharacter: msPerChar.toFixed(2),
    },
  };
}

/**
 * Synthesize with validation
 * Wraps synthesizeSpeech with automatic validation
 */
export async function synthesizeWithValidation(
  text,
  locale,
  synthesizeFn,
  options = {}
) {
  const startMs = Date.now();

  try {
    // Synthesize
    const audio = await synthesizeFn(text, locale);
    const synthesisMs = Date.now() - startMs;

    // Validate result
    const validation = await validateChunkSynthesis(text, audio, {
      synthesisTimeMs: synthesisMs,
      locale,
    });

    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    // Log warnings
    if (validation.warnings.length > 0) {
      console.warn(`[SynthesisValidator] Warnings:`, validation.warnings);
    }

    return {
      audio,
      valid: true,
      synthesisMs,
      validation,
    };
  } catch (err) {
    return {
      audio: null,
      valid: false,
      synthesisMs: Date.now() - startMs,
      error: err.message,
    };
  }
}

/**
 * Synthesize with retry + validation
 * If synthesis fails or validation fails, retry
 */
export async function synthesizeWithRetry(
  text,
  locale,
  synthesizeFn,
  options = {}
) {
  const {
    maxRetries = 3,
    retryDelayMs = 500,
  } = options;

  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await synthesizeWithValidation(
        text,
        locale,
        synthesizeFn,
        options
      );

      if (result.valid) {
        console.log(
          `[SynthesizeRetry] Success on attempt ${attempt}/${maxRetries} (${result.synthesisMs}ms)`
        );
        return result;
      } else {
        lastError = result.error;
        console.warn(`[SynthesizeRetry] Validation failed on attempt ${attempt}: ${result.error}`);
      }
    } catch (err) {
      lastError = err.message;
      console.warn(`[SynthesizeRetry] Error on attempt ${attempt}: ${err.message}`);
    }

    // Wait before retry (exponential backoff)
    if (attempt < maxRetries) {
      const delayMs = retryDelayMs * Math.pow(2, attempt - 1);
      console.log(`[SynthesizeRetry] Waiting ${delayMs}ms before retry...`);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  // All retries exhausted
  return {
    audio: null,
    valid: false,
    synthesisMs: 0,
    error: `Failed after ${maxRetries} attempts: ${lastError}`,
    attempts: maxRetries,
  };
}

/**
 * Get detailed validation report
 * For logging/debugging
 */
export function getValidationReport(audio, chunkIndex) {
  const validation = validateAudioChunk(audio, chunkIndex);

  const report = {
    timestamp: new Date().toISOString(),
    chunkIndex,
    validation,
  };

  if (!validation.valid) {
    report.status = '❌ FAILED';
    report.issues = validation.errors;
  } else if (validation.warnings.length > 0) {
    report.status = '⚠️ WARNING';
    report.issues = validation.warnings;
  } else {
    report.status = '✅ VALID';
  }

  return report;
}
