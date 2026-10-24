import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { checkHealth, getPairingStatus, setClientAuth } from '@involvex/ctrl-i';
import {
  connectionFromScanData,
  saveConnection,
} from '../src/connection/storage';

const BARCODE_TYPES = ['qr'] as Array<'qr'>;

export default function ScanPairScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [status, setStatus] = useState(
    'point at desktop Host QR (or ctrl-f5 pair)'
  );
  const [busy, setBusy] = useState(false);
  const handled = useRef(false);

  const applyPayload = useCallback(
    async (raw: string) => {
      if (handled.current || busy) {
        return;
      }
      const connection = connectionFromScanData(raw);
      if (!connection) {
        setStatus('not a ctrl pair QR — try again');
        return;
      }
      handled.current = true;
      setBusy(true);
      setStatus(`pairing ${connection.gatewayUrl}…`);
      try {
        setClientAuth({
          token: connection.token || undefined,
        });
        await saveConnection(connection);
        const pairing = await getPairingStatus(connection.gatewayUrl);
        const health = await checkHealth(connection.gatewayUrl);
        setStatus(
          `ok · ${health.service} ${health.version} · auth ${pairing.required ? 'required' : 'open'}`
        );
        setTimeout(() => {
          router.replace('/');
        }, 600);
      } catch (err) {
        handled.current = false;
        setBusy(false);
        setStatus(
          `failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    },
    [busy, router]
  );

  if (!permission) {
    return (
      <SafeAreaView style={styles.root}>
        <ActivityIndicator color="#00ff66" />
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.root}>
        <StatusBar style="light" />
        <Text style={styles.title}>camera permission</Text>
        <Text style={styles.meta}>
          Needed to scan the pair QR from desktop Host or ctrl-f5 pair.
        </Text>
        <Pressable
          style={styles.button}
          onPress={() => void requestPermission()}
        >
          <Text style={styles.buttonText}>allow camera</Text>
        </Pressable>
        <Pressable style={styles.linkBtn} onPress={() => router.back()}>
          <Text style={styles.link}>← back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />
      <Text style={styles.title}>scan pair QR</Text>
      <Text style={styles.meta}>{status}</Text>
      <View style={styles.cameraWrap}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }}
          onBarcodeScanned={
            busy
              ? undefined
              : (event) => {
                  void applyPayload(event.data);
                }
          }
        />
      </View>
      <Pressable style={styles.linkBtn} onPress={() => router.back()}>
        <Text style={styles.link}>← back</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
    paddingHorizontal: 24,
    paddingVertical: 24,
    gap: 12,
  },
  title: {
    color: '#00ff66',
    fontFamily: 'monospace',
    fontSize: 22,
    fontWeight: '700',
  },
  meta: {
    color: '#6b7f72',
    fontFamily: 'monospace',
    fontSize: 12,
    lineHeight: 18,
  },
  cameraWrap: {
    flex: 1,
    minHeight: 280,
    borderWidth: 1,
    borderColor: '#00ff66',
    overflow: 'hidden',
    backgroundColor: '#111613',
  },
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
  linkBtn: {
    paddingVertical: 8,
  },
  link: {
    color: '#00ff66',
    fontFamily: 'monospace',
  },
});
