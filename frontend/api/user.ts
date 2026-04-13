import { axiosInstance } from './axios.js';
import type { AuthUser } from './auth';

export type UpdatePreferencesPayload = {
  userId: string;
  voiceCloningEnabled: boolean;
};

export type UpdatePreferencesResponse = {
  status: boolean;
  message: string;
  user?: AuthUser & { voiceCloningEnabled?: boolean };
};

export async function updatePreferences(
  payload: UpdatePreferencesPayload,
): Promise<UpdatePreferencesResponse> {
  const { data } = await axiosInstance.patch<UpdatePreferencesResponse>(
    'auth/preferences',
    payload,
  );
  return data;
}

export type VoiceSetupPayload = {
  userId: string;
  audioBase64: string;
  mimeType: string;
};

export type VoiceSetupResponse = {
  status: boolean;
  message: string;
  voiceId?: string;
};

export async function voiceSetupApi(
  payload: VoiceSetupPayload,
): Promise<VoiceSetupResponse> {
  const { data } = await axiosInstance.post<VoiceSetupResponse>(
    'auth/voice-setup',
    payload,
    { timeout: 60_000 }, // ElevenLabs can take time
  );
  return data;
}

