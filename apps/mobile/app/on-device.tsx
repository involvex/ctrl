import { useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import {
  evaluateOnDevicePolicy,
  type DeviceCapabilities,
  type PolicyDecision,
} from '@involvex/ctrl-s';
import { ModelRegistry, useModel } from 'react-native-litert-lm';
import {
  backendForPolicy,
  probeDeviceCapabilities,
} from '../src/device/capabilities';
import { saveGeneratorMode } from '../src/device/inference-mode';
import {
  DEFAULT_MODEL_URL,
  describeDownloadError,
  downloadModelWithRetry,
  isRemoteModelUrl,
  loadSavedModelSource,
  normalizeModelPath,
  saveModelSource,
} from '../src/device/model-source';
import {
  GhostButton,
  ModeChip,
  NavRow,
  PrimaryButton,
  Section,
  StatusPanel,
  colors,
  fonts,
} from '../src/ui';

function ModelSetup({
  pathOrUrl,
  backend,
  decision,
  onReprobe,
  onSourceChange,
}: {
  pathOrUrl: string;
  backend: 'cpu' | 'gpu' | 'npu';
  decision: PolicyDecision;
  onReprobe: () => Promise<PolicyDecision | null>;
  onSourceChange: (next: string) => void;
}) {
  const engine = useModel(pathOrUrl, {
    backend,
    autoLoad: !isRemoteModelUrl(pathOrUrl),
    enableMemoryTracking: true,
    systemPrompt: 'You are ctrl on-device assistant. Be concise.',
    maxOutputTokens: 512,
    maxContextTokens: 2048,
  });
  const [localError, setLocalError] = useState<string | null>(null);
  const [manualProgress, setManualProgress] = useState(0);
  const [busyAction, setBusyAction] = useState<'idle' | 'download' | 'import'>(
    'idle'
  );

  const downloading =
    busyAction === 'download' ||
    (engine.downloadProgress > 0 && engine.downloadProgress < 1);
  const downloadPct = Math.round(
    (busyAction === 'download' ? manualProgress : engine.downloadProgress) * 100
  );

  const onDownloadAndLoad = useCallback(() => {
    setLocalError(null);
    setBusyAction('download');
    setManualProgress(0);
    void (async () => {
      try {
        if (isRemoteModelUrl(pathOrUrl)) {
          const localPath = await downloadModelWithRetry(pathOrUrl, {
            attempts: 3,
            onProgress: setManualProgress,
          });
          await saveModelSource(localPath);
          onSourceChange(localPath);
          return;
        }
        await engine.load();
      } catch (err: unknown) {
        setLocalError(describeDownloadError(err));
        try {
          if (isRemoteModelUrl(pathOrUrl)) {
            ModelRegistry.deleteFile(pathOrUrl);
          }
          await engine.deleteModel();
        } catch {
          // ignore
        }
      } finally {
        setBusyAction('idle');
      }
    })();
  }, [engine, onSourceChange, pathOrUrl]);

  const onImportFromFilesystem = useCallback(() => {
    setLocalError(null);
    setBusyAction('import');
    void (async () => {
      try {
        const result = await DocumentPicker.getDocumentAsync({
          type: ['application/octet-stream', 'application/x-litertlm', '*/*'],
          copyToCacheDirectory: true,
          multiple: false,
        });
        if (result.canceled || !result.assets?.[0]?.uri) {
          return;
        }
        const asset = result.assets[0];
        const name = (asset.name ?? asset.uri).toLowerCase();
        if (!name.includes('.litertlm') && !name.endsWith('.litertlm')) {
          setLocalError(
            'Pick a .litertlm model file (e.g. gemma-4-E2B-it.litertlm).'
          );
          return;
        }
        const localPath = normalizeModelPath(asset.uri);
        const size = ModelRegistry.getFileSizeBytes(localPath);
        if (size <= 0) {
          setLocalError(
            `Imported path not readable (${localPath}). Try copying the file into app storage first.`
          );
          return;
        }
        await saveModelSource(localPath);
        onSourceChange(localPath);
      } catch (err: unknown) {
        setLocalError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusyAction('idle');
      }
    })();
  }, [onSourceChange]);

  const onClearCache = useCallback(() => {
    setLocalError(null);
    void (async () => {
      try {
        ModelRegistry.deleteFile(DEFAULT_MODEL_URL);
        await engine.deleteModel();
        await saveModelSource(DEFAULT_MODEL_URL);
        onSourceChange(DEFAULT_MODEL_URL);
      } catch (err: unknown) {
        setLocalError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, [engine, onSourceChange]);

  const onVerifyLoad = useCallback(() => {
    setLocalError(null);
    void (async () => {
      const fresh = await onReprobe();
      if (fresh && !fresh.allowed) {
        setLocalError(
          `policy blocked: ${fresh.reasons.join('; ') || 'not allowed'}`
        );
        return;
      }
      try {
        if (!engine.isReady) {
          await engine.load();
        }
      } catch (err: unknown) {
        setLocalError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, [engine, onReprobe]);

  const sourceLabel = isRemoteModelUrl(pathOrUrl)
    ? 'HuggingFace URL (download)'
    : `local · ${pathOrUrl.split(/[/\\]/).pop() ?? pathOrUrl}`;

  return (
    <View style={styles.block}>
      <Text style={styles.label}>
        LiteRT · Gemma 4 E2B · backend {backend}
        {decision.warnings.length > 0
          ? ` · ${decision.warnings.join('; ')}`
          : ''}
      </Text>
      <Text style={styles.meta}>source · {sourceLabel}</Text>
      {!engine.isReady ? (
        <View style={styles.block}>
          <Pressable
            style={[styles.button, downloading && styles.buttonDisabled]}
            onPress={onDownloadAndLoad}
            disabled={busyAction !== 'idle'}
          >
            {busyAction === 'download' ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.buttonText}>
                {downloading
                  ? `downloading ${downloadPct}%`
                  : isRemoteModelUrl(pathOrUrl)
                    ? 'download + load (~2.6 GB, 3 retries)'
                    : 'load local model'}
              </Text>
            )}
          </Pressable>
          {downloading ? (
            <View style={styles.progressTrack}>
              <View
                style={[styles.progressFill, { width: `${downloadPct}%` }]}
              />
            </View>
          ) : null}
          <Pressable
            style={[
              styles.secondaryBtn,
              busyAction !== 'idle' && styles.buttonDisabled,
            ]}
            onPress={onImportFromFilesystem}
            disabled={busyAction !== 'idle'}
          >
            <Text style={styles.secondaryText}>
              import .litertlm from filesystem
            </Text>
          </Pressable>
          <Text style={styles.meta}>
            Prefer: download gemma-4-E2B-it.litertlm on a PC, copy to the phone,
            then Import. Chat uses this model when generator is On this phone.
          </Text>
        </View>
      ) : (
        <View style={styles.block}>
          <Text style={styles.meta}>
            model ready
            {engine.memoryEstimate?.verdict
              ? ` · memory ${engine.memoryEstimate.verdict}`
              : ''}
          </Text>
          <Pressable style={styles.linkBtn} onPress={onVerifyLoad}>
            <Text style={styles.link}>re-verify load</Text>
          </Pressable>
          <Pressable style={styles.linkBtn} onPress={onClearCache}>
            <Text style={styles.link}>clear model cache / switch source</Text>
          </Pressable>
        </View>
      )}
      {(localError ?? engine.error) ? (
        <Text style={styles.error}>{localError ?? engine.error}</Text>
      ) : null}
    </View>
  );
}

export default function OnDeviceScreen() {
  const router = useRouter();
  const [caps, setCaps] = useState<DeviceCapabilities | null>(null);
  const [decision, setDecision] = useState<PolicyDecision | null>(null);
  const [busy, setBusy] = useState(true);
  const [modelSource, setModelSource] = useState(DEFAULT_MODEL_URL);

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
      const saved = await loadSavedModelSource();
      if (!cancelled) {
        setModelSource(saved);
      }
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
  const canSetup = Boolean(caps?.litertAvailable);
  const policyHint = !caps?.litertAvailable
    ? 'LiteRT native module not linked (Expo Go cannot run Gemma). Use a dev-client / release build.'
    : decision && !decision.allowed
      ? `Policy blocked for LiteRT only: ${decision.reasons.join('; ') || 'not allowed'}. Chat still works with This PC / Cloud.`
      : null;

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scroll}>
        <GhostButton
          label="← back"
          onPress={() => {
            router.back();
          }}
          style={styles.back}
        />
        <Text style={styles.title}>model setup</Text>
        <ModeChip mode="litert" />
        <Text style={styles.meta}>
          Download / import LiteRT models and review policy. Conversation lives
          in Chat — this screen is not a second chat.
        </Text>

        {busy || !caps || !decision ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <>
            <StatusPanel
              lines={[
                `${caps.platform} · api ${caps.apiLevel ?? '—'} · ram ${caps.totalMemoryMb ?? '—'} MB · litert ${caps.litertAvailable ? 'yes' : 'no'}`,
                `abi ${caps.abi.length ? caps.abi.join(',') : '(empty→arm64)'} · arm64 ${caps.isArm64 ? 'yes' : 'no'}`,
                `battery ${
                  caps.batteryLevel !== null
                    ? `${Math.round(caps.batteryLevel * 100)}%`
                    : '—'
                } · ${caps.batteryState}${caps.lowPowerMode ? ' · low-power' : ''}`,
                `policy · ${decision.allowed ? 'allowed' : 'blocked'}${
                  decision.reasons.length
                    ? ` · ${decision.reasons.join('; ')}`
                    : ''
                }`,
              ]}
            />
            <PrimaryButton
              label="re-probe capabilities"
              onPress={() => {
                void refresh();
              }}
            />

            {policyHint ? (
              <StatusPanel>
                <Text style={styles.error}>{policyHint}</Text>
              </StatusPanel>
            ) : null}

            {canSetup ? (
              <ModelSetup
                key={modelSource}
                pathOrUrl={modelSource}
                backend={backend}
                decision={decision}
                onReprobe={probePolicy}
                onSourceChange={setModelSource}
              />
            ) : null}
          </>
        )}

        <Section title="Chat">
          <PrimaryButton
            label="open chat (on this phone)"
            onPress={() => {
              void (async () => {
                await saveGeneratorMode('litert');
                router.push('/chat' as Href);
              })();
            }}
          />
          <NavRow
            label="Open chat"
            subtitle="Always /chat — pick generator there"
            onPress={() => {
              router.push('/chat' as Href);
            }}
          />
          <NavRow
            label="Provider settings"
            onPress={() => {
              router.push('/settings' as Href);
            }}
          />
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 24, gap: 12 },
  back: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 8 },
  title: {
    color: colors.accent,
    fontFamily: fonts.mono,
    fontSize: 22,
    fontWeight: '700',
  },
  link: { color: colors.accent, fontFamily: fonts.mono },
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
  button: {
    backgroundColor: '#00ff66',
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: '#00ff66',
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryText: {
    color: '#00ff66',
    fontFamily: 'monospace',
    fontWeight: '700',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: {
    color: '#000',
    fontFamily: 'monospace',
    fontWeight: '700',
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
