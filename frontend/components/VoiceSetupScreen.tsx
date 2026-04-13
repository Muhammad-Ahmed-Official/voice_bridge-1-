import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Platform, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Mic, MicOff, Check, SkipForward, AlertCircle, RefreshCw } from 'lucide-react-native';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder as useExpoAudioRecorder,
} from 'expo-audio';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import { voiceSetupApi } from '@/api/user';

const THEME = {
  background: '#0F1219',
  surface:    '#1A1F2B',
  border:     '#2D3548',
  primary:    '#06B6D4',
  secondary:  '#6366F1',
  success:    '#10B981',
  danger:     '#F43F5E',
  textMain:   '#F8FAFC',
  textMuted:  '#94A3B8',
};

const RECORD_DURATION_MS = 40_000;
const MIN_DURATION_MS    = 15_000;

const SAMPLE_TEXT =
  `Voice Bridge is an advanced multilingual speech translation application. ` +
  `It listens to what you say, translates it in real time, and lets the other ` +
  `person hear it in their own language instantly. Please read this paragraph clearly ` +
  `and naturally, pausing slightly between sentences. Your voice sample will be used ` +
  `to create a personalized AI voice clone that sounds just like you during calls.`;

type RecordState = 'idle' | 'recording' | 'done' | 'uploading' | 'success' | 'error';

type Props = {
  userId: string;
  onDone: () => void;
};

export function VoiceSetupScreen({ userId, onDone }: Props) {
  const [recordState, setRecordState] = useState<RecordState>('idle');
  const [elapsedMs,   setElapsedMs]   = useState(0);
  const [errorMsg,    setErrorMsg]     = useState('');
  const [audioBase64, setAudioBase64]  = useState<string | null>(null);
  const [mimeType,    setMimeType]     = useState('audio/m4a');

  const recorder    = useExpoAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef    = useRef(0);
  const activeRef   = useRef(false);

  const progress = Math.min(elapsedMs / RECORD_DURATION_MS, 1);
  const canStop  = elapsedMs >= MIN_DURATION_MS;

  useEffect(() => {
    return () => {
      if (timerRef.current)    clearInterval(timerRef.current);
      if (autoStopRef.current) clearTimeout(autoStopRef.current);
    };
  }, []);

  const finishRecording = useCallback(async () => {
    activeRef.current = false;
    if (timerRef.current)    clearInterval(timerRef.current);
    if (autoStopRef.current) clearTimeout(autoStopRef.current);

    try {
      await recorder.stop();
      const uri = (recorder as any)?.uri as string | undefined;
      if (!uri) throw new Error('No recording URI after stop');

      const b64 = await FileSystemLegacy.readAsStringAsync(uri, {
        encoding: FileSystemLegacy.EncodingType.Base64,
      });
      await FileSystemLegacy.deleteAsync(uri, { idempotent: true });

      const mime = Platform.OS === 'ios' ? 'audio/m4a' : 'audio/m4a';
      setAudioBase64(b64);
      setMimeType(mime);
      setRecordState('done');
    } catch (err: any) {
      setErrorMsg('Recording failed — ' + (err.message || 'unknown error'));
      setRecordState('error');
    }
  }, [recorder]);

  const startRecording = useCallback(async () => {
    setElapsedMs(0);
    setAudioBase64(null);
    setErrorMsg('');
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        setErrorMsg('Microphone permission denied. Please allow it in device settings.');
        setRecordState('error');
        return;
      }

      await setAudioModeAsync({
        allowsRecording:  true,
        playsInSilentMode: true,
        interruptionMode:  'doNotMix',
      });

      await recorder.prepareToRecordAsync();
      await recorder.record();

      activeRef.current = true;
      startRef.current  = Date.now();
      setRecordState('recording');

      timerRef.current = setInterval(() => {
        setElapsedMs(Date.now() - startRef.current);
      }, 100);

      autoStopRef.current = setTimeout(() => {
        if (activeRef.current) finishRecording();
      }, RECORD_DURATION_MS);

    } catch (err: any) {
      setErrorMsg('Could not start recording: ' + (err.message || 'unknown error'));
      setRecordState('error');
    }
  }, [recorder, finishRecording]);

  const uploadVoice = useCallback(async () => {
    if (!audioBase64) return;
    setRecordState('uploading');
    try {
      await voiceSetupApi({ userId, audioBase64, mimeType });
      setRecordState('success');
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Upload failed';
      setErrorMsg(msg);
      setRecordState('error');
    }
  }, [audioBase64, mimeType, userId]);

  const reset = useCallback(() => {
    setRecordState('idle');
    setElapsedMs(0);
    setAudioBase64(null);
    setErrorMsg('');
  }, []);

  const formatTime = (ms: number) => `${Math.floor(ms / 1000)}s`;
  const remaining  = Math.max(0, Math.ceil((MIN_DURATION_MS - elapsedMs) / 1000));

  return (
    <View style={s.page}>
      <LinearGradient colors={['#0F1219', '#07090D']} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={s.safe}>
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

          {/* ── Header ───────────────────────────────────────────── */}
          <View style={s.header}>
            <LinearGradient colors={[THEME.primary, THEME.secondary]} style={s.iconCircle}>
              <Mic size={34} color="#fff" />
            </LinearGradient>
            <Text style={s.title}>Set Up Your AI Voice</Text>
            <Text style={s.subtitle}>
              Record yourself reading the text below (40 sec). This creates your personalized AI voice clone.
            </Text>
          </View>

          {/* ── Sample text ──────────────────────────────────────── */}
          <View style={s.textCard}>
            <Text style={s.textCardLabel}>READ THIS ALOUD</Text>
            <Text style={s.sampleText}>{SAMPLE_TEXT}</Text>
          </View>

          {/* ── Progress bar ─────────────────────────────────────── */}
          {(recordState === 'recording' || recordState === 'done') && (
            <View style={s.progressWrap}>
              <View style={s.progressTrack}>
                <View style={[s.progressFill, { width: `${progress * 100}%` as any }]} />
              </View>
              <Text style={s.progressLabel}>
                {recordState === 'recording'
                  ? `Recording: ${formatTime(elapsedMs)} / 40s`
                  : `Recorded: ${formatTime(elapsedMs)} ✓`}
              </Text>
            </View>
          )}

          {/* ── Action buttons ───────────────────────────────────── */}
          {recordState === 'idle' && (
            <TouchableOpacity style={s.actionBtn} onPress={startRecording}>
              <LinearGradient colors={[THEME.primary, THEME.secondary]} style={s.btnInner}>
                <Mic size={22} color="#fff" />
                <Text style={s.btnText}>Start Recording</Text>
              </LinearGradient>
            </TouchableOpacity>
          )}

          {recordState === 'recording' && (
            <TouchableOpacity
              style={[s.actionBtn, !canStop && s.btnDisabled]}
              onPress={canStop ? finishRecording : undefined}
              activeOpacity={canStop ? 0.8 : 1}
            >
              <LinearGradient
                colors={canStop ? [THEME.danger, '#C0392B'] : ['#374151', '#4B5563']}
                style={s.btnInner}
              >
                <MicOff size={22} color="#fff" />
                <Text style={s.btnText}>
                  {canStop ? 'Stop Recording' : `Keep going… ${remaining}s left`}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          )}

          {recordState === 'done' && (
            <>
              <TouchableOpacity style={s.actionBtn} onPress={uploadVoice}>
                <LinearGradient colors={[THEME.success, '#059669']} style={s.btnInner}>
                  <Check size={22} color="#fff" />
                  <Text style={s.btnText}>Use This Recording</Text>
                </LinearGradient>
              </TouchableOpacity>
              <TouchableOpacity style={s.ghostBtn} onPress={reset}>
                <RefreshCw size={15} color={THEME.textMuted} />
                <Text style={s.ghostText}>Re-record</Text>
              </TouchableOpacity>
            </>
          )}

          {recordState === 'uploading' && (
            <View style={s.centerBox}>
              <ActivityIndicator color={THEME.primary} size="large" />
              <Text style={s.uploadingText}>Creating your AI voice clone…</Text>
              <Text style={s.uploadingSubText}>This may take up to 30 seconds</Text>
            </View>
          )}

          {recordState === 'success' && (
            <View style={s.successBox}>
              <LinearGradient colors={[THEME.success, '#059669']} style={s.successIcon}>
                <Check size={36} color="#fff" />
              </LinearGradient>
              <Text style={s.successTitle}>Voice Clone Ready!</Text>
              <Text style={s.successDesc}>
                Your AI voice has been set up. Every translation will sound exactly like you.
              </Text>
              <TouchableOpacity style={s.actionBtn} onPress={onDone}>
                <LinearGradient colors={[THEME.primary, THEME.secondary]} style={s.btnInner}>
                  <Text style={s.btnText}>Sign In to Continue →</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}

          {recordState === 'error' && (
            <View style={s.errorBox}>
              <AlertCircle size={36} color={THEME.danger} />
              <Text style={s.errorText}>{errorMsg}</Text>
              <TouchableOpacity style={s.ghostBtn} onPress={reset}>
                <RefreshCw size={15} color={THEME.textMuted} />
                <Text style={s.ghostText}>Try Again</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Skip ─────────────────────────────────────────────── */}
          {(recordState === 'idle' || recordState === 'error') && (
            <TouchableOpacity style={s.skipBtn} onPress={onDone}>
              <SkipForward size={15} color={THEME.textMuted} />
              <Text style={s.skipText}>Skip for now</Text>
            </TouchableOpacity>
          )}

          <Text style={s.tip}>
            💡 Speak clearly in a quiet room. Recording auto-stops at 40 seconds.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  page:           { flex: 1, backgroundColor: '#0F1219' },
  safe:           { flex: 1 },
  scroll:         { padding: 24, paddingBottom: 48 },

  header:         { alignItems: 'center', marginBottom: 28 },
  iconCircle:     { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  title:          { fontSize: 24, fontWeight: '700', color: '#F8FAFC', marginBottom: 8, textAlign: 'center' },
  subtitle:       { fontSize: 13, color: '#94A3B8', textAlign: 'center', lineHeight: 20 },

  textCard:       { backgroundColor: '#1A1F2B', borderRadius: 14, padding: 18, marginBottom: 24, borderWidth: 1, borderColor: '#2D3548' },
  textCardLabel:  { fontSize: 11, fontWeight: '700', color: '#06B6D4', letterSpacing: 1.5, marginBottom: 10 },
  sampleText:     { fontSize: 15, color: '#F8FAFC', lineHeight: 25 },

  progressWrap:   { marginBottom: 20 },
  progressTrack:  { height: 6, backgroundColor: '#2D3548', borderRadius: 3, overflow: 'hidden', marginBottom: 8 },
  progressFill:   { height: '100%', backgroundColor: '#06B6D4', borderRadius: 3 },
  progressLabel:  { fontSize: 13, color: '#94A3B8', textAlign: 'center' },

  actionBtn:      { borderRadius: 14, overflow: 'hidden', marginBottom: 12 },
  btnDisabled:    { opacity: 0.65 },
  btnInner:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16 },
  btnText:        { fontSize: 16, fontWeight: '700', color: '#fff' },

  ghostBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, marginBottom: 8 },
  ghostText:      { fontSize: 14, color: '#94A3B8' },

  centerBox:      { alignItems: 'center', paddingVertical: 28 },
  uploadingText:  { fontSize: 16, fontWeight: '600', color: '#F8FAFC', marginTop: 16 },
  uploadingSubText: { fontSize: 13, color: '#94A3B8', marginTop: 6 },

  successBox:     { alignItems: 'center', paddingVertical: 16, gap: 12 },
  successIcon:    { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  successTitle:   { fontSize: 22, fontWeight: '700', color: '#10B981' },
  successDesc:    { fontSize: 14, color: '#94A3B8', textAlign: 'center', lineHeight: 21, marginBottom: 8 },

  errorBox:       { alignItems: 'center', paddingVertical: 16, gap: 10 },
  errorText:      { fontSize: 14, color: '#F43F5E', textAlign: 'center', lineHeight: 20 },

  skipBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, marginTop: 4 },
  skipText:       { fontSize: 14, color: '#94A3B8' },

  tip:            { fontSize: 12, color: '#64748B', textAlign: 'center', marginTop: 20, lineHeight: 18 },
});
