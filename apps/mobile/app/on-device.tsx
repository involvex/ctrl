import { useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  evaluateOnDevicePolicy,
  type DeviceCapabilities,
  type PolicyDecision,
} from '@involvex/ctrl-s';
import { GEMMA_4_E2B_IT, useModel } from 'react-native-litert-lm';
import {
  backendForPolicy,
  probeDeviceCapabilities,
} from '../src/device/capabilities';

function LitertChat({
  backend,
  decision,
}: {
  backend: 'cpu' | 'gpu' | 'npu';
  decision: PolicyDecision;
}) {
  const engine = useModel(GEMMA_4_E2B_IT, {
    backend,
    autoLoad: false,
    enableMemoryTracking: true,
    systemPrompt: 'You are ctrl on-device assistant. Be concise.',
    maxOutputTokens: 512,
    maxContextTokens: 2048,
  });
  const [prompt, setPrompt] = useState('Say hello in one short sentence.');
  const [reply, setReply] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const onLoad = useCallback(() => {
    setLocalError(null);
    void engine.load().catch((err: unknown) => {
      setLocalError(err instanceof Error ? err.message : String(err));
    });
  }, [engine]);

  const onGenerate = useCallback(() => {
    setLocalError(null);
    setReply('');
    void engine
      .generate(prompt.trim())
      .then((text) => setReply(text))
      .catch((err: unknown) => {
        setLocalError(err instanceof Error ? err.message : String(err));
      });
  }, [engine, prompt]);

  return (
    <View style={styles.block}>
      <Text style={styles.label}>
        LiteRT · Gemma 4 E2B · backend {backend}
        {decision.warnings.length > 0
          ? ` · ${decision.warnings.join('; ')}`
          : ''}
      </Text>
      {!engine.isReady ? (
        <Pressable style={styles.button} onPress={onLoad}>
          <Text style={styles.buttonText}>
            {engine.downloadProgress > 0 && engine.downloadProgress < 1
              ? `downloading ${Math.round(engine.downloadProgress * 100)}%`
              : 'download + load model (~2.6 GB)'}
          </Text>
        </Pressable>
      ) : (
        <Text style={styles.meta}>
          model ready
          {engine.memoryEstimate?.verdict
            ? ` · memory ${engine.memoryEstimate.verdict}`
            : ''}
        </Text>
      )}
      <TextInput
        style={styles.input}
        value={prompt}
        onChangeText={setPrompt}
        placeholder="prompt"
        placeholderTextColor="#6b7f72"
        multiline
        editable={!engine.isGenerating}
      />
      <Pressable
        style={[
          styles.button,
          (!engine.isReady || engine.isGenerating) && styles.buttonDisabled,
        ]}
        disabled={!engine.isReady || engine.isGenerating}
        onPress={onGenerate}
      >
        {engine.isGenerating ? (
          <ActivityIndicator color="#000" />
        ) : (
          <Text style={styles.buttonText}>generate</Text>
        )}
      </Pressable>
      {(localError ?? engine.error) ? (
        <Text style={styles.error}>{localError ?? engine.error}</Text>
      ) : null}
      {reply ? (
        <View style={styles.panel}>
          <Text style={styles.bubbleText}>{reply}</Text>
        </View>
      ) : null}
    </View>
  );
}

export default function OnDeviceScreen() {
  const router = useRouter();
  const [caps, setCaps] = useState<DeviceCapabilities | null>(null);
  const [decision, setDecision] = useState<PolicyDecision | null>(null);
  const [busy, setBusy] = useState(true);

  const refresh = useCallback(async () => {
    setBusy(true);
    const next = await probeDeviceCapabilities();
    setCaps(next);
    setDecision(
      evaluateOnDevicePolicy(next, {
        modelId: 'GEMMA_4_E2B_IT',
        minMemoryMb: 4096,
        preferredBackend: 'cpu',
      })
    );
    setBusy(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setBusy(true);
      const next = await probeDeviceCapabilities();
      if (cancelled) {
        return;
      }
      setCaps(next);
      setDecision(
        evaluateOnDevicePolicy(next, {
          modelId: 'GEMMA_4_E2B_IT',
          minMemoryMb: 4096,
          preferredBackend: 'cpu',
        })
      );
      setBusy(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const backend = backendForPolicy(decision?.backend ?? null);
  const canRun = Boolean(decision?.allowed && caps?.litertAvailable);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.link}>← back</Text>
        </Pressable>
        <Text style={styles.title}>on-device</Text>
        <Text style={styles.meta}>
          LiteRT-LM inference on this phone (policy → load → generate).
        </Text>

        {busy || !caps || !decision ? (
          <ActivityIndicator color="#00ff66" />
        ) : (
          <>
            <View style={styles.panel}>
              <Text style={styles.meta}>
                {caps.platform} · api {caps.apiLevel ?? '—'} · ram{' '}
                {caps.totalMemoryMb ?? '—'} MB · litert{' '}
                {caps.litertAvailable ? 'yes' : 'no'}
              </Text>
              <Text style={styles.meta}>
                battery{' '}
                {caps.batteryLevel !== null
                  ? `${Math.round(caps.batteryLevel * 100)}%`
                  : '—'}{' '}
                · {caps.batteryState}
                {caps.lowPowerMode ? ' · low-power' : ''}
              </Text>
              <Text style={styles.meta}>
                policy · {decision.allowed ? 'allowed' : 'blocked'}
                {decision.reasons.length
                  ? ` · ${decision.reasons.join('; ')}`
                  : ''}
              </Text>
            </View>
            <Pressable style={styles.linkBtn} onPress={() => void refresh()}>
              <Text style={styles.link}>re-probe capabilities</Text>
            </Pressable>

            {canRun ? (
              <LitertChat backend={backend} decision={decision} />
            ) : (
              <Text style={styles.error}>
                Need an arm64 Android/iOS dev or release build with LiteRT
                linked, plus policy green (battery/thermal/RAM). Expo Go is not
                enough.
              </Text>
            )}
          </>
        )}

        <Pressable onPress={() => router.push('/settings' as Href)}>
          <Text style={styles.link}>provider settings →</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/chat' as Href)}>
          <Text style={styles.link}>gateway chat →</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  scroll: { padding: 24, gap: 12 },
  title: {
    color: '#00ff66',
    fontFamily: 'monospace',
    fontSize: 22,
    fontWeight: '700',
  },
  link: { color: '#00ff66', fontFamily: 'monospace' },
  linkBtn: { paddingVertical: 4 },
  label: {
    color: '#00ff66',
    fontFamily: 'monospace',
    fontSize: 12,
    marginBottom: 8,
  },
  meta: {
    color: '#6b7f72',
    fontFamily: 'monospace',
    fontSize: 12,
    lineHeight: 18,
  },
  error: { color: '#ff6666', fontFamily: 'monospace', fontSize: 12 },
  block: { gap: 10 },
  panel: {
    borderWidth: 1,
    borderColor: '#1f3328',
    padding: 12,
    backgroundColor: '#0a0f0c',
    gap: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#00ff66',
    color: '#00ff66',
    fontFamily: 'monospace',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#111613',
    minHeight: 72,
    textAlignVertical: 'top',
  },
  button: {
    backgroundColor: '#00ff66',
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: {
    color: '#000',
    fontFamily: 'monospace',
    fontWeight: '700',
  },
  bubbleText: {
    color: '#00ff66',
    fontFamily: 'monospace',
    fontSize: 13,
    lineHeight: 18,
  },
});
