import { Link } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type {
  DeviceCapabilities,
  InferenceBackend,
  PolicyDecision,
} from '@involvex/ctrl-s';
import {
  prepareOnDeviceSession,
  runOnDevicePrompt,
} from '../src/device/on-device-session';

export default function OnDeviceScreen() {
  const [caps, setCaps] = useState<DeviceCapabilities | null>(null);
  const [decision, setDecision] = useState<PolicyDecision | null>(null);
  const [backend, setBackend] = useState<InferenceBackend>('cpu');
  const [prompt, setPrompt] = useState('Say hello from on-device ctrl.');
  const [output, setOutput] = useState('');
  const [busy, setBusy] = useState(false);
  const [probing, setProbing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setProbing(true);
    setError(null);
    try {
      const session = await prepareOnDeviceSession(backend);
      setCaps(session.capabilities);
      setDecision(session.decision);
      if (session.decision.backend) {
        setBackend(session.decision.backend);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setProbing(false);
    }
  }, [backend]);

  const onRun = useCallback(async () => {
    if (!decision?.allowed || !decision.backend) {
      return;
    }
    setBusy(true);
    setOutput('');
    setError(null);
    await runOnDevicePrompt(prompt, decision.backend, {
      onToken: (text) => setOutput((prev) => prev + text),
      onDone: () => setBusy(false),
      onError: (message) => {
        setError(message);
        setBusy(false);
      },
    });
  }, [decision, prompt]);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <Link href="/" style={styles.back}>
          ← connect
        </Link>
        <Text style={styles.brand}>on-device</Text>
        <Text style={styles.tagline}>LiteRT-LM · Phase 6</Text>

        <Pressable
          style={[styles.button, styles.ghost]}
          onPress={() => {
            void refresh();
          }}
          disabled={probing || busy}
        >
          {probing ? (
            <ActivityIndicator color="#00ff66" />
          ) : (
            <Text style={styles.ghostText}>probe capabilities</Text>
          )}
        </Pressable>

        {caps ? (
          <View style={styles.panel}>
            <Text style={styles.meta}>
              platform · {caps.platform} ·{' '}
              {caps.isArm64 ? 'arm64' : caps.abi.join(',') || 'abi?'}
            </Text>
            <Text style={styles.meta}>
              api · {caps.apiLevel ?? '—'} · ram ·{' '}
              {caps.totalMemoryMb != null
                ? `${Math.round(caps.totalMemoryMb)} MB`
                : '—'}
            </Text>
            <Text style={styles.meta}>
              battery ·{' '}
              {caps.batteryLevel != null
                ? `${Math.round(caps.batteryLevel * 100)}%`
                : '—'}{' '}
              · {caps.batteryState}
              {caps.lowPowerMode ? ' · low-power' : ''}
            </Text>
            <Text style={styles.meta}>
              thermal · {caps.thermalState} · litert ·{' '}
              {caps.litertAvailable ? 'yes' : 'no'}
            </Text>
            <Text style={styles.meta}>
              backends · cpu={caps.backends.cpu ? '1' : '0'} gpu=
              {caps.backends.gpu ? '1' : '0'} npu=
              {caps.backends.npu ? '1' : '0'}
            </Text>
          </View>
        ) : (
          <Text style={styles.meta}>
            Tap probe to check ABI, RAM, battery, and LiteRT availability.
          </Text>
        )}

        {decision ? (
          <View style={styles.panel}>
            <Text style={styles.meta}>
              policy · {decision.allowed ? 'allowed' : 'blocked'}
              {decision.backend ? ` · ${decision.backend}` : ''}
            </Text>
            {decision.reasons.map((r) => (
              <Text key={r} style={styles.reason}>
                ✕ {r}
              </Text>
            ))}
            {decision.warnings.map((w) => (
              <Text key={w} style={styles.warn}>
                ! {w}
              </Text>
            ))}
          </View>
        ) : null}

        <Text style={styles.label}>Prompt</Text>
        <TextInput
          style={styles.input}
          value={prompt}
          onChangeText={setPrompt}
          editable={!busy}
          multiline
          placeholderTextColor="#6b7f72"
        />

        <Pressable
          style={[
            styles.button,
            (!decision?.allowed || busy) && styles.buttonDisabled,
          ]}
          onPress={() => {
            void onRun();
          }}
          disabled={!decision?.allowed || busy}
        >
          {busy ? (
            <ActivityIndicator color="#000000" />
          ) : (
            <Text style={styles.buttonText}>run on-device</Text>
          )}
        </Pressable>

        {error ? <Text style={styles.reason}>{error}</Text> : null}
        {output ? (
          <View style={styles.panel}>
            <Text style={styles.meta}>output</Text>
            <Text style={styles.output}>{output}</Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingVertical: 28,
    gap: 10,
  },
  back: {
    color: '#6b7f72',
    fontFamily: 'monospace',
    marginBottom: 8,
  },
  brand: {
    color: '#00ff66',
    fontSize: 36,
    fontWeight: '700',
    letterSpacing: 4,
    fontFamily: 'monospace',
  },
  tagline: {
    color: '#6b7f72',
    fontFamily: 'monospace',
    marginBottom: 12,
  },
  label: {
    color: '#00ff66',
    fontFamily: 'monospace',
    fontSize: 12,
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#00ff66',
    color: '#00ff66',
    fontFamily: 'monospace',
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#111613',
    minHeight: 88,
    textAlignVertical: 'top',
  },
  button: {
    backgroundColor: '#00ff66',
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: {
    color: '#000000',
    fontFamily: 'monospace',
    fontWeight: '700',
  },
  ghost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#1f3328',
  },
  ghostText: {
    color: '#00ff66',
    fontFamily: 'monospace',
  },
  panel: {
    borderWidth: 1,
    borderColor: '#1f3328',
    backgroundColor: '#0a0f0c',
    padding: 12,
    gap: 6,
  },
  meta: {
    color: '#00ff66',
    fontFamily: 'monospace',
    fontSize: 12,
    opacity: 0.85,
  },
  reason: {
    color: '#ff6666',
    fontFamily: 'monospace',
    fontSize: 12,
  },
  warn: {
    color: '#ffcc66',
    fontFamily: 'monospace',
    fontSize: 12,
  },
  output: {
    color: '#00ff66',
    fontFamily: 'monospace',
    fontSize: 13,
    lineHeight: 18,
  },
});
