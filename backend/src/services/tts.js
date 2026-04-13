import { logger } from '../config/logger.js';
import { ELEVENLABS_VOICE_ID } from '../config/elevenlabs.config.js';
import { User } from '../models/user.models.js';
import { synthesizeWithElevenLabs } from './elevenlabsTts.js';

const LANG_MAP = {
  'ur-PK': 'ur',
  'en-US': 'en',
  'ar-SA': 'ar',
  'UR': 'ur',
  'EN': 'en',
  'AR': 'ar',
};

/**
 * Decide at runtime whether to use ElevenLabs cloned voice or default voice.
 *
 * Priority:
 * 1. In-memory cloned voice (if clonedVoiceId provided)
 * 2. DB-stored cloned voice (if user has voiceId in DB)
 * 3. Default ElevenLabs voice (ELEVENLABS_VOICE_ID)
 * 4. None (return null if no voice configured)
 *
 * @param {Object} params
 * @param {string} params.text
 * @param {string} params.locale - Target locale for the listener.
 * @param {string} params.speakerUserId - Logical userId of the speaker.
 * @param {string} [params.clonedVoiceId] - In-memory cloned voice_id if clone is ready.
 * @param {boolean} [params.cloningEnabled] - Whether cloning is enabled for this speaker.
 * @param {boolean} [params.listenerCloningEnabled=false] - Whether the listener has cloning ON.
 * @returns {Promise<string|null>} Base64-encoded audio.
 */
export async function getTtsForUser({
  text,
  locale,
  speakerUserId,
  clonedVoiceId,
  cloningEnabled,
  listenerCloningEnabled = false,
}) {
  if (!text || !text.trim()) return null;

  // 1. Try in-memory cloned voice if provided
  if (clonedVoiceId && cloningEnabled) {
    try {
      const audio = await synthesizeWithElevenLabs(text, locale, clonedVoiceId);
      if (audio) {
        logger.info('TTS Router', `✅ CLONED VOICE (in-memory) — speaker=${speakerUserId} voice_id=${clonedVoiceId}`);
        return audio;
      }
    } catch (err) {
      logger.warn('TTS Router', `⚠️ ElevenLabs cloned voice failed (voice_id=${clonedVoiceId}): ${err.message} — returning null (no fallback TTS when clone is active)`);
    }
    return null;
  }

  // 2. Try DB-stored cloned voice
  if (speakerUserId) {
    try {
      const user = await User.findOne({ userId: speakerUserId }).lean();
      const userCloningEnabled = !!user?.voiceCloningEnabled;

      const dbVoiceId =
        user && typeof user.voiceId === 'string' && user.voiceId.length > 0
          ? user.voiceId
          : null;

      if (userCloningEnabled && dbVoiceId) {
        try {
          const audio = await synthesizeWithElevenLabs(text, locale, dbVoiceId);
          if (audio) {
            logger.info('TTS Router', `✅ CLONED VOICE (from DB) — speaker=${speakerUserId} voice_id=${dbVoiceId}`);
            return audio;
          }
        } catch (err) {
          logger.warn('TTS Router', `⚠️ ElevenLabs (DB voice_id=${dbVoiceId}) failed, falling back to default ElevenLabs voice: ${err.message}`);
        }
      } else if (userCloningEnabled && !dbVoiceId) {
        logger.info('TTS Router', `⏳ CLONE PENDING — speaker=${speakerUserId} using default ElevenLabs voice until clone ready`);
      }
    } catch (err) {
      logger.warn('TTS Router', `Failed to read user preferences, falling back to default ElevenLabs voice: ${err.message}`);
    }
  }

  // 3. Default: ElevenLabs with default voice
  if (ELEVENLABS_VOICE_ID) {
    try {
      const audio = await synthesizeWithElevenLabs(text, locale, ELEVENLABS_VOICE_ID);
      if (audio) {
        logger.info('TTS Router', `🔊 DEFAULT ELEVENLABS VOICE — speaker=${speakerUserId ?? 'unknown'} locale=${locale}`);
        return audio;
      }
    } catch (err) {
      logger.error('TTS Router', `ElevenLabs default voice failed: ${err.message}`);
      return null;
    }
  }

  // 4. No voice configured
  logger.warn('TTS Router', 'No ELEVENLABS_VOICE_ID set — audio skipped');
  return null;
}

/**
 * Backwards-compatible wrapper for tests.
 * Synthesizes text to speech using the default ElevenLabs voice.
 *
 * @param {string} text - Text to synthesize
 * @param {string} locale - Target locale (e.g., 'en-US', 'ur-PK')
 * @returns {Promise<string|null>} Base64-encoded audio
 */
export async function synthesizeSpeech(text, locale) {
  return getTtsForUser({
    text,
    locale,
    speakerUserId: undefined,
    clonedVoiceId: undefined,
    cloningEnabled: false,
  });
}
