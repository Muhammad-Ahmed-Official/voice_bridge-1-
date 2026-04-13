const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || '';

// TTS Model: Flash v2.5 for ultra-low latency (~75ms) with multilingual support for UR/EN/AR
const ELEVENLABS_MODEL_ID =
  process.env.ELEVENLABS_MODEL_ID || 'eleven_flash_v2_5';

// STT Model: Scribe v2 for speech-to-text recognition
const ELEVENLABS_STT_MODEL =
  process.env.ELEVENLABS_STT_MODEL || 'scribe_v2';

// Optional default voice for TTS; if not provided, TTS will be skipped
const ELEVENLABS_VOICE_ID =
  process.env.ELEVENLABS_VOICE_ID || '';

export {
  ELEVENLABS_API_KEY,
  ELEVENLABS_MODEL_ID,
  ELEVENLABS_STT_MODEL,
  ELEVENLABS_VOICE_ID,
};

