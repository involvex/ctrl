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
  onReprobe,
}: {
  backend: 'cpu' | 'gpu' | 'npu';
  decision: PolicyDecision;
  onReprobe: () => Promise<PolicyDecision | null>;
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
  const downloading =
    engine.downloadProgress > 0 && engine.downloadProgress < 1;
  const downloadPct = Math.round(engine.downloadProgress * 100);

  const onLoad = useCallback(() => {
    setLocalError(null);
    void engine.load().catch((err: unknown) => {
      setLocalError(err instanceof Error ? err.message : String(err));
    });
  }, [engine]);

  const onGenerate = useCallback(() => {
    setLocalError(null);
    setReply('');
    void (async () => {
      const fresh = await onReprobe();
      if (fresh && !fresh.allowed) {
        setLocalError(
          `policy blocked before generate: ${fresh.reasons.join('; ') || 'not allowed'}. Use gateway chat offline instead.`
        );
        return;
      }
      try {
        const text = await engine.generate(prompt.trim());
        setReply(text);
      } catch (err: unknown) {
        setLocalError(
          `${err instanceof Error ? err.message : String(err)} — if offline or model missing, pair a gateway and use chat.`
        );
      }
    })();
  }, [engine, onReprobe, prompt]);

  return (
    <View style={styles.block}>
      <Text style={styles.label}>
        LiteRT · Gemma 4 E2B · backend {backend}
        {decision.warnings.length > 0
          ? ` · ${decision.warnings.join('; ')}`
          : ''}
      </Text>
      {!engine.isReady ? (
        <View style={styles.block}>
          <Pressable
            style={[styles.button, downloading && styles.buttonDisabled]}
            onPress={onLoad}
            disabled={downloading}
          >
            <Text style={styles.buttonText}>
              {downloading
                ? `downloading ${downloadPct}%`
                : 'download + load model (~2.6 GB)'}
            </Text>
          </Pressable>
          {downloading ? (
            <View style={styles.progressTrack}>
              <View
                style={[styles.progressFill, { width: `${downloadPct}%` }]}
              />
            </View>
          ) : null}
          <Text style={styles.meta}>
            Needs network once for the model weights. After that, inference is
            on-device; if download fails, use gateway chat.
          </Text>
        </View>
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

  const probePolicy = useCallback(async (): Promise<PolicyDecision | null> => {
    const next = await probeDeviceCapabilities();
    const policy = evaluateOnDevicePolicy(next, {
      modelId: 'GEMMA_4_E2B_IT',
      minMemoryMb: 4096,
      preferredBackend: 'cpu',
    });
    setCaps(next);
    setDecision(policy);
    return policy;
  }, []);

  const refresh = useCallback(async () => {
    setBusy(true);
    await probePolicy();
    setBusy(false);
  }, [probePolicy]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setBusy(true);
      await probePolicy();
      if (!cancelled) {
        setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [probePolicy]);

  const backend = backendForPolicy(decision?.backend ?? null);
  const canRun = Boolean(decision?.allowed && caps?.litertAvailable);
  const offlineHint = !caps?.litertAvailable
    ? 'LiteRT native module not linked (Expo Go cannot run Gemma). Pair a PC gateway and use chat for offline-capable host inference.'
    : decision && !decision.allowed
      ? `Policy blocked: ${decision.reasons.join('; ') || 'not allowed'}. Charge/cool the device, then re-probe — or use gateway chat.`
      : null;

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
              <LitertChat
                backend={backend}
                decision={decision}
                onReprobe={probePolicy}
              />
            ) : (
              <View style={styles.panel}>
                <Text style={styles.error}>
                  {offlineHint ??
                    'Need an arm64 Android/iOS dev or release build with LiteRT linked, plus policy green (battery/thermal/RAM).'}
                </Text>
                <Pressable onPress={() => router.push('/chat' as Href)}>
                  <Text style={styles.link}>fallback → gateway chat</Text>
                </Pressable>
              </View>
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
  progressTrack: {
    height: 6,
    backgroundColor: '#1f3328',
    overflow: 'hidden',
  },
  progressFill: {
    height: 6,
    backgroundColor: '#00ff66',
  },
});
