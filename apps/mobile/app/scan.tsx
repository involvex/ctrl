import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { parsePairPayload } from '@involvex/ctrl-s';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'ctrl.mobile.connection';

export default function ScanPairScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const barcodeSettings = useMemo(
    () => ({ barcodeTypes: ['qr'] as Array<'qr'> }),
    []
  );

  const onBarcode = useCallback(
    async (data: string) => {
      if (locked) {
        return;
      }
      const payload = parsePairPayload(data);
      if (!payload) {
        setError('Not a ctrl pair QR');
        return;
      }
      setLocked(true);
      setError(null);
      try {
        await AsyncStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            gatewayUrl: payload.gatewayUrl,
            token: payload.token,
          })
        );
        router.replace('/');
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setLocked(false);
      }
    },
    [locked, router]
  );

  if (!permission) {
    return (
      <SafeAreaView style={styles.root}>
        <Text style={styles.meta}>camera…</Text>
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.root}>
        <StatusBar style="light" />
        <Text style={styles.brand}>scan</Text>
        <Text style={styles.meta}>
          Camera access is needed to read pair QR.
        </Text>
        <Pressable
          style={styles.button}
          onPress={() => void requestPermission()}
        >
          <Text style={styles.buttonText}>allow camera</Text>
        </Pressable>
        <Pressable style={styles.ghost} onPress={() => router.back()}>
          <Text style={styles.ghostText}>← back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />
      <Text style={styles.brand}>scan</Text>
      <Text style={styles.meta}>Point at `ctrl-f5 pair` QR</Text>
      <View style={styles.cameraWrap}>
        <CameraView
          style={styles.camera}
          facing="back"
          barcodeScannerSettings={barcodeSettings}
          onBarcodeScanned={
            locked
              ? undefined
              : (result) => {
                  void onBarcode(result.data);
                }
          }
        />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable style={styles.ghost} onPress={() => router.back()}>
        <Text style={styles.ghostText}>← back</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
    paddingHorizontal: 24,
    paddingVertical: 28,
    gap: 12,
  },
  brand: {
    color: '#00ff66',
    fontSize: 36,
    fontWeight: '700',
    letterSpacing: 4,
    fontFamily: 'monospace',
  },
  meta: {
    color: '#6b7f72',
    fontFamily: 'monospace',
    fontSize: 12,
  },
  cameraWrap: {
    flex: 1,
    minHeight: 280,
    borderWidth: 1,
    borderColor: '#00ff66',
    overflow: 'hidden',
  },
  camera: { flex: 1 },
  button: {
    backgroundColor: '#00ff66',
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: {
    color: '#000000',
    fontFamily: 'monospace',
    fontWeight: '700',
  },
  ghost: { paddingVertical: 10 },
  ghostText: { color: '#6b7f72', fontFamily: 'monospace' },
  error: { color: '#ff6666', fontFamily: 'monospace', fontSize: 12 },
});
