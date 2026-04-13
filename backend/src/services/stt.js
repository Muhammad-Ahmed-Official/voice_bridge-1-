import { logger } from '../config/logger.js';
import { ELEVENLABS_API_KEY, ELEVENLABS_STT_MODEL } from '../config/elevenlabs.config.js';

const ELEVENLABS_STT_URL = 'https://api.elevenlabs.io/v1/speech-to-text';

// Map language codes to ElevenLabs Scribe v2 supported codes
const LANGUAGE_CODE_MAP = {
  'ur-PK': 'ur',
  'en-US': 'en',
  'ar-SA': 'ar',
  'ur': 'ur',
  'en': 'en',
  'ar': 'ar',
};

// Map MIME types to file extensions
const MIME_TO_EXT = {
  'audio/webm': 'webm',
  'audio/webm;codecs=opus': 'webm',
  'audio/ogg': 'ogg',
  'audio/ogg;codecs=opus': 'ogg',
  'audio/l16': 'wav',
  'audio/l16;rate=16000': 'wav',
  'audio/wav': 'wav',
  'audio/amr-wb': 'amr',
  'audio/amr': 'amr',
  'audio/m4a': 'm4a',
  'audio/mp4': 'mp4',
  'audio/aac': 'aac',
  'audio/mpeg': 'mp3',
};

// Non-speech markers to filter out from transcripts
const NON_SPEECH_MARKERS = [
  'background noise',
  'music',
  'voice breathing',
  'breathing',
  'whispering',
  'silence',
  'mouse clicking',
  'keyboard typing',
  'birds chirping',
  'door slam',
  'phone ringing',
  'door opening',
  'dog barking',
  'car horn',
  'siren',
  'wind blowing',
  'paper rustling',
  'coughing',
  'throat clearing',
  'audience murmuring',
  'speech recognition failed',
];

/**
 * Filter out non-speech markers from transcript.
 * Removes bracketed non-speech sounds like [background noise], [voice breathing], etc.
 * @param {string} transcript - Raw transcript from STT
 * @returns {string} - Cleaned transcript
 */
function filterNonSpeechMarkers(transcript) {
  if (!transcript) return '';

  let cleaned = transcript;

  // Remove bracketed markers like [background noise], [voice breathing], etc.
  NON_SPEECH_MARKERS.forEach((marker) => {
    const patterns = [
      new RegExp(`\\[${marker}\\]`, 'gi'), // [background noise]
      new RegExp(`\\s*${marker}\\s*`, 'gi'), // background noise (without brackets)
    ];
    patterns.forEach((pattern) => {
      cleaned = cleaned.replace(pattern, '');
    });
  });

  // Clean up extra whitespace
  cleaned = cleaned
    .replace(/\s+/g, ' ') // Multiple spaces to single space
    .trim();

  return cleaned;
}

/**
 * Transcribe audio using ElevenLabs Scribe v2 API.
 *
 * @param {string} audioBase64 - base64-encoded audio bytes
 * @param {string} languageCode - language code (ur-PK, en-US, ar-SA, etc.)
 * @param {string} mimeType - MIME type of audio (audio/webm, audio/m4a, etc.)
 * @param {object} options - options (unused, for compatibility)
 * @returns {Promise<string>} - transcript text
 */
export async function transcribeAudio(
  audioBase64,
  languageCode,
  mimeType = 'audio/webm;codecs=opus',
  options,
) {
  if (!ELEVENLABS_API_KEY) {
    throw new Error('ELEVENLABS_API_KEY is not set in backend/.env');
  }

  // Map language code to ElevenLabs format
  const mappedLangCode = LANGUAGE_CODE_MAP[languageCode] ?? languageCode.substring(0, 2).toLowerCase();

  // Get file extension from MIME type
  const fileExt = MIME_TO_EXT[mimeType] ?? 'webm';

  logger.info('STT', `ElevenLabs Scribe v2: mimeType=${mimeType}, ext=${fileExt}, lang=${mappedLangCode}`);

  // Convert base64 to Buffer
  const audioBuffer = Buffer.from(audioBase64, 'base64');

  // Create FormData for multipart request
  const formData = new FormData();
  formData.append('file', new Blob([audioBuffer], { type: mimeType }), `audio.${fileExt}`);
  formData.append('model_id', ELEVENLABS_STT_MODEL);
  formData.append('language_code', mappedLangCode);

  try {
    const res = await fetch(ELEVENLABS_STT_URL, {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
      },
      body: formData,
    });

    const data = await res.json();

    if (!res.ok) {
      logger.error('STT', `ElevenLabs API error (${res.status}): ${JSON.stringify(data)}`);
      throw new Error(`ElevenLabs STT API error ${res.status}: ${data.error?.message || data.message || 'Unknown error'}`);
    }

    const rawTranscript = data.text ?? '';
    const cleanedTranscript = filterNonSpeechMarkers(rawTranscript);

    if (cleanedTranscript.trim()) {
      logger.info('STT', `ElevenLabs recognized (${languageCode}): "${cleanedTranscript}"`);
      return cleanedTranscript;
    }

    // If transcript only contained non-speech markers, return empty
    if (rawTranscript !== cleanedTranscript) {
      logger.info('STT', `Transcript filtered (only non-speech): "${rawTranscript}" → empty`);
      return '';
    }

    return cleanedTranscript;
  } catch (err) {
    logger.error('STT', `ElevenLabs transcription failed: ${err.message}`);
    throw err;
  }
}
