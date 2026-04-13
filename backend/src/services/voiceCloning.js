import { logger } from '../config/logger.js';
import { ELEVENLABS_API_KEY } from '../config/elevenlabs.config.js';
import { User } from '../models/user.models.js';

const cloneBuffers = new Map();

const activeCallUsers = new Set();


const voiceLimitUsers = new Set();

export function markUserCallActive(userId) {
  activeCallUsers.add(userId);
}

export function markUserCallEnded(userId) {
  activeCallUsers.delete(userId);
}


const CLONE_WINDOW_MS = 45_000; // collect 20 s of wall-clock audio
const MIN_CHUNKS      = 3;      // need at least 3 segments for a usable sample


export function initCloneBuffer(socketId, userId, existingVoiceId = null) {
  cloneBuffers.delete(socketId);

  const limitReached = voiceLimitUsers.has(userId);
  const hasExistingVoice = typeof existingVoiceId === 'string' && existingVoiceId.length > 0;

  cloneBuffers.set(socketId, {
    chunks:           [],
    mimeType:         'audio/webm',
    startTime:        null,   // set on first chunk
    userId,
    status:           hasExistingVoice ? 'ready' : (limitReached ? 'failed' : 'buffering'),
    voiceId:          hasExistingVoice ? existingVoiceId : null,
    cloneTriggered:   false,   // guard: prevent duplicate performVoiceClone calls
    voiceLimitReached: limitReached,
  });

  if (hasExistingVoice) {
    logger.info('VoiceClone', `Reusing stored voice for user=${userId} voice_id=${existingVoiceId}`);
  } else if (limitReached) {
    logger.warn('VoiceClone', `User=${userId} hit voice limit previously — cloning disabled for this session`);
  } else {
    logger.info('VoiceClone', `Buffer initialised for user=${userId} socket=${socketId}`);
  }
}

/**
 * Add a raw audio chunk to the buffer.
 * @param {string} socketId
 * @param {string} audioBase64
 * @param {string} mimeType  - e.g. 'audio/webm;codecs=opus' or 'audio/m4a'
 * @returns {boolean} true when 10 s have elapsed AND we have enough chunks → caller should trigger performVoiceClone()
 */
export function addChunkToCloneBuffer(socketId, audioBase64, mimeType) {
  const state = cloneBuffers.get(socketId);
  if (!state || state.status !== 'buffering') return false;

  if (state.startTime === null) {
    state.startTime = Date.now();
    state.mimeType = mimeType ? mimeType.split(';')[0].trim() : 'audio/webm';
  }

  state.chunks.push(Buffer.from(audioBase64, 'base64'));

  const elapsedMs = Date.now() - state.startTime;
  const shouldTrigger =
    elapsedMs >= CLONE_WINDOW_MS &&
    state.chunks.length >= MIN_CHUNKS &&
    !state.cloneTriggered;

  if (shouldTrigger) {
    state.cloneTriggered = true; // latch: only one caller gets true
  }
  return shouldTrigger;
}


export function getCloneState(socketId) {
  return cloneBuffers.get(socketId) ?? null;
}


export function getClonedVoiceId(socketId) {
  return cloneBuffers.get(socketId)?.voiceId ?? null;
}

/**
 * Upload buffered audio to ElevenLabs Instant Voice Cloning API.
 * Saves the resulting voice_id to MongoDB.
 *
 * @param {string} socketId
 * @returns {Promise<string>} voice_id
 * @throws on API or network failure
 */
export async function performVoiceClone(socketId) {
  const state = cloneBuffers.get(socketId);
  if (!state) throw new Error(`[VoiceClone] No buffer for socket ${socketId}`);

  // Guard: already done or in progress
  if (state.status === 'ready')   return state.voiceId;
  if (state.status === 'cloning') throw new Error('[VoiceClone] Clone already in progress');
  if (state.status === 'failed')  throw new Error('[VoiceClone] Previous clone attempt failed');

  if (state.chunks.length === 0) {
    state.status = 'failed';
    throw new Error('[VoiceClone] No audio data collected — cannot clone');
  }

  state.status = 'cloning';

  try {
    const ext = state.mimeType.includes('m4a') ? 'm4a' : 'webm';
    const totalBytes = state.chunks.reduce((a, b) => a + b.length, 0);
    const combined = Buffer.concat(state.chunks);
    if (combined.length < 50000) { // Approx 50KB minimum for a decent sample
      state.status = 'failed';
      throw new Error('[VoiceClone] Audio sample too small for quality cloning');
    }
    const voiceName = `user_${state.userId}`;
    const voiceId = await getOrCreateVoice(state.userId, {
      name: voiceName,
      mimeType: state.mimeType,
      ext,
      combined,
      totalBytes,
    });

    state.status = 'ready';
    state.voiceId = voiceId;

    logger.info('VoiceClone', `Success — user=${state.userId} voice_id=${voiceId}`);
    return voiceId;

  } catch (err) {
    state.status = 'failed';
    if (err?.message === 'VOICE_LIMIT_REACHED') {
      state.voiceLimitReached = true;
      voiceLimitUsers.add(state.userId);
    }
    logger.warn('VoiceClone', `Failed for user=${state.userId}: ${err.message}`);
    throw err;
  }
}


export function resetCloneBufferForRetry(socketId) {
  const state = cloneBuffers.get(socketId);
  if (!state) return false;

  if (state.voiceLimitReached) {
    logger.warn('VoiceClone', `Skipping retry for user=${state.userId} — voice limit is permanent`);
    return false;
  }

  state.chunks         = [];
  state.startTime      = null;
  state.status         = 'buffering';
  state.cloneTriggered = false;
  state.voiceId        = null;

  logger.info('VoiceClone', `Buffer reset for retry — user=${state.userId} socket=${socketId}`);
  return true;
}


export function isVoiceLimitReached(socketId) {
  return cloneBuffers.get(socketId)?.voiceLimitReached ?? false;
}


export function clearCloneBuffer(socketId) {
  if (cloneBuffers.has(socketId)) {
    cloneBuffers.delete(socketId);
    logger.info('VoiceClone', `Buffer cleared for socket ${socketId}`);
  }
}

/**
 * Onboarding voice clone — called from REST API, no buffer state needed.
 * Takes raw audio directly, creates ElevenLabs voice, saves to DB.
 *
 * @param {string} userId
 * @param {string} audioBase64
 * @param {string} mimeType - e.g. 'audio/m4a'
 * @returns {Promise<string>} voice_id
 */
export async function cloneVoiceFromAudio(userId, audioBase64, mimeType) {
  if (!ELEVENLABS_API_KEY) throw new Error('Missing ELEVENLABS_API_KEY');

  const combined = Buffer.from(audioBase64, 'base64');
  if (combined.length < 50_000) {
    throw new Error('Audio sample too small — please record at least 15-20 seconds of clear speech.');
  }

  const safeMime = mimeType || 'audio/m4a';
  const ext = safeMime.includes('m4a') ? 'm4a' : safeMime.includes('ogg') ? 'ogg' : 'webm';

  const voiceId = await getOrCreateVoice(userId, {
    name:       `user_${userId}`,
    mimeType:   safeMime,
    ext,
    combined,
    totalBytes: combined.length,
  });

  await User.updateOne({ userId }, { $set: { voiceCloningEnabled: true, voiceId } });
  logger.info('VoiceClone', `Onboarding clone done — user=${userId} voice_id=${voiceId}`);
  return voiceId;
}

async function getOrCreateVoice(userId, audioSample) {
  if (!ELEVENLABS_API_KEY) throw new Error('Missing ELEVENLABS_API_KEY');

  const user = await User.findOne({ userId }).lean();
  if (!user) throw new Error(`User not found for voice clone: ${userId}`);

  logger.info('VoiceClone', `User ID: ${user.userId}`);
  logger.info('VoiceClone', `Voice ID: ${user.voiceId}`);

  // Step 1: Reuse existing DB voice first.
  if (user.voiceId) {
    logger.info('VoiceClone', `Using existing voice from DB: ${user.voiceId}`);
    return user.voiceId;
  }

  // Step 2: Recover existing voice from ElevenLabs by deterministic name.
  const voicesResponse = await fetch('https://api.elevenlabs.io/v1/voices', {
    method: 'GET',
    headers: { 'xi-api-key': ELEVENLABS_API_KEY },
  });
  if (!voicesResponse.ok) {
    const errText = await voicesResponse.text().catch(() => '(no body)');
    throw new Error(`ElevenLabs /v1/voices HTTP ${voicesResponse.status}: ${errText}`);
  }

  const voicesData = await voicesResponse.json();
  const voices = Array.isArray(voicesData?.voices) ? voicesData.voices : [];
  const existingVoice = voices.find((v) => v?.name === audioSample.name);
  if (existingVoice?.voice_id) {
    await User.updateOne({ userId }, { $set: { voiceId: existingVoice.voice_id } });
    logger.info('VoiceClone', `Recovered existing voice from API: ${existingVoice.voice_id}`);
    return existingVoice.voice_id;
  }

  // Step 3: Create only if no voice exists.
  const blob = new Blob([audioSample.combined], { type: audioSample.mimeType });
  const formData = new FormData();
  formData.append('name', audioSample.name);
  formData.append('description', `Auto-cloned for ${userId}`);
  formData.append('remove_background_noise', 'true');
  formData.append('files', blob, `voice_sample.${audioSample.ext}`);

  logger.info('VoiceClone', `Creating new voice (${(audioSample.totalBytes / 1024).toFixed(1)} KB) for user=${userId}`);

  const createResponse = await fetch('https://api.elevenlabs.io/v1/voices/add', {
    method: 'POST',
    headers: { 'xi-api-key': ELEVENLABS_API_KEY },
    body: formData,
  });
  if (!createResponse.ok) {
    const errText = await createResponse.text().catch(() => '(no body)');
    if (errText.includes('voice_limit_reached')) {
      throw new Error('VOICE_LIMIT_REACHED');
    }
    throw new Error(`ElevenLabs /v1/voices/add HTTP ${createResponse.status}: ${errText}`);
  }

  const created = await createResponse.json();
  const createdVoiceId = created?.voice_id;
  if (!createdVoiceId) throw new Error('ElevenLabs returned no voice_id');

  await User.updateOne({ userId }, { $set: { voiceId: createdVoiceId } });
  logger.info('VoiceClone', `Created new voice: ${createdVoiceId}`);
  return createdVoiceId;
}