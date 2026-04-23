import { useState, useCallback } from 'react';
import { Platform, PermissionsAndroid } from 'react-native';

// Metro skips static resolution when the module name is in a variable.
// This lets the app bundle in Expo Go (where native modules are absent)
// and still work correctly in a real EAS / dev-client build.
const BT_CLASSIC_MODULE = 'react-native-bluetooth-classic';
const AUDIO_SESSION_MODULE = 'react-native-audio-session';

export type BluetoothDevice = {
  id: string;
  name: string;
};

export type BtConnectState = 'disconnected' | 'connecting' | 'connected' | 'error';

const isNative = Platform.OS === 'ios' || Platform.OS === 'android';

async function requestAndroidPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    const apiLevel = (Platform as any).Version ?? 0;
    if (apiLevel >= 31) {
      const result = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      ]);
      return result['android.permission.BLUETOOTH_CONNECT'] === PermissionsAndroid.RESULTS.GRANTED;
    }
    // API < 31: no runtime BT permission needed for bonded devices
    return true;
  } catch {
    return false;
  }
}

export function useBluetooth() {
  const [pairedDevices, setPairedDevices]       = useState<BluetoothDevice[]>([]);
  const [connectedDeviceId, setConnectedDeviceId] = useState<string | null>(null);
  const [connectState, setConnectState]         = useState<BtConnectState>('disconnected');
  const [error, setError]                       = useState<string | null>(null);
  const [isLoading, setIsLoading]               = useState(false);

  // ── Fetch already-paired devices from the OS ──────────────────────────────
  const fetchPairedDevices = useCallback(async () => {
    if (!isNative) {
      setError('Bluetooth is only available on iOS and Android (dev build required).');
      return;
    }
    const hasPermission = await requestAndroidPermissions();
    if (!hasPermission) {
      setError('Bluetooth permission denied. Please allow it in device settings.');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const RNBluetoothClassic = require(BT_CLASSIC_MODULE).default;
      const bonded: any[] = await RNBluetoothClassic.getBondedDevices();
      const devices: BluetoothDevice[] = bonded
        .filter((d: any) => !!d.name)
        .map((d: any) => ({ id: d.address, name: d.name as string }));
      setPairedDevices(devices);
    } catch {
      setError('Could not load paired devices. Make sure you are using a dev/EAS build.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ── Connect: route all audio output to the selected Bluetooth device ──────
  const connectDevice = useCallback(async (deviceId: string) => {
    if (!isNative) return;
    setConnectState('connecting');
    setError(null);
    try {
      if (Platform.OS === 'ios') {
        // iOS: configure AVAudioSession to allow Bluetooth A2DP output.
        // The OS then automatically routes audio to the connected AirPods/headset.
        const AudioSession = require(AUDIO_SESSION_MODULE).default;
        await AudioSession.setCategory('PlayAndRecord', [
          'AllowBluetooth',
          'AllowBluetoothA2DP',
          'DefaultToSpeaker',
        ]);
        await AudioSession.setActive(true);
      } else {
        // Android: open a Classic BT connection; the OS routes audio automatically.
        const RNBluetoothClassic = require(BT_CLASSIC_MODULE).default;
        await RNBluetoothClassic.connectToDevice(deviceId);
      }
      setConnectedDeviceId(deviceId);
      setConnectState('connected');
    } catch (e: any) {
      setError('Could not connect: ' + (e?.message ?? 'unknown error'));
      setConnectState('error');
    }
  }, []);

  // ── Disconnect: restore default audio routing ──────────────────────────────
  const disconnectDevice = useCallback(async () => {
    try {
      if (Platform.OS === 'ios') {
        const AudioSession = require(AUDIO_SESSION_MODULE).default;
        await AudioSession.setCategory('SoloAmbient', []);
      } else if (connectedDeviceId) {
        const RNBluetoothClassic = require(BT_CLASSIC_MODULE).default;
        try { await RNBluetoothClassic.disconnectFromDevice(connectedDeviceId); } catch {}
      }
    } catch {}
    setConnectedDeviceId(null);
    setConnectState('disconnected');
  }, [connectedDeviceId]);

  return {
    pairedDevices,
    connectedDeviceId,
    connectState,
    error,
    isLoading,
    fetchPairedDevices,
    connectDevice,
    disconnectDevice,
  };
}
