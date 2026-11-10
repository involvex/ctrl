import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
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
import {
  evaluateOnDevicePolicy,
  type DeviceCapabilities,
  type PolicyDecision,
} from '@involvex/ctrl-s';
import { ModelRegistry } from 'react-native-litert-lm';
import {
  backendForPolicy,
  probeDeviceCapabilities,
} from '../src/device/capabilities';
import { saveGeneratorMode } from '../src/device/inference-mode';
import {
  ensureLitertLoaded,
  unloadLitertEngine,
} from '../src/device/litert-engine';
import { assertModelFileUsable } from '../src/device/model-size';
import {
  DEFAULT_MODEL_URL,
  describeDownloadError,
  clearDownloadProgress,
  downloadModelWithRetry,
  isRemoteModelUrl,
  loadDownloadProgress,
  loadSavedModelSource,
  saveDownloadProgress,
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

/**
 * Loads via the process-wide LiteRT singleton (never useModel here — chat
 * uses the same singleton; dual engines OOM phones).
 * Partial/bad files abort native createConversation — size-gated before load.
 */
function ModelEngineHost({
  pathOrUrl,
  backend,
  onReprobe,
  onLoaded,
  onFailed,
  onUnloadRequest,
}: {
  pathOrUrl: string;
  backend: 'cpu' | 'gpu' | 'npu';
  onReprobe: () => Promise<PolicyDecision | null>;
  onLoaded: (detail: string) => void;
  onFailed: (message: string) => void;
  onUnloadRequest: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onReprobeRef = useRef(onReprobe);
  const onLoadedRef = useRef(onLoaded);
  const onFailedRef = useRef(onFailed);

  useEffect(() => {
    onReprobeRef.current = onReprobe;
    onLoadedRef.current = onLoaded;
    onFailedRef.current = onFailed;
  }, [onFailed, onLoaded, onReprobe]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const size = assertModelFileUsable(pathOrUrl);
        const fresh = await onReprobeRef.current();
        if (fresh && !fresh.allowed) {
          onFailedRef.current(
            `policy blocked: ${fresh.reasons.join('; ') || 'not allowed'}`
          );
          return;
        }
        await ensureLitertLoaded({
          path: pathOrUrl,
          backend,
          systemPrompt: 'You are ctrl on-device assistant. Be concise.',
        });
        if (cancelled) {
          return;
        }
        setReady(true);
        onLoadedRef.current(
          `model ready · ${(size / (1024 * 1024)).toFixed(0)} MB`
        );
      } catch (err: unknown) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : String(err);
          setError(message);
          onFailedRef.current(message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [backend, pathOrUrl]);

  return (
    <View style={styles.block}>
      {loading ? (
        <ActivityIndicator color={colors.accent} />
      ) : ready ? (
        <Text style={styles.meta}>engine loaded (shared with chat)</Text>
      ) : (
        <Text style={styles.meta}>engine idle</Text>
      )}
      <Pressable
        style={styles.linkBtn}
        onPress={() => {
          void (async () => {
            try {
              await unloadLitertEngine();
            } catch {
              // ignore
            }
            setReady(false);
            onUnloadRequest();
          })();
        }}
      >
        <Text style={styles.link}>unload engine (keeps file on disk)</Text>
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

/** Download / import / path UI — never mounts useModel. */
function ModelSourcePanel({
  pathOrUrl,
  backend,
  decision,
  engineArmed,
  onSourceChange,
  onArmEngine,
}: {
  pathOrUrl: string;
  backend: 'cpu' | 'gpu' | 'npu';
  decision: PolicyDecision;
  engineArmed: boolean;
  onSourceChange: (next: string) => void;
  onArmEngine: () => void;
}) {
  const [localError, setLocalError] = useState<string | null>(null);
  const [manualProgress, setManualProgress] = useState(0);
  const [savedProgress, setSavedProgress] = useState(0);
  const [busyAction, setBusyAction] = useState<'idle' | 'download' | 'import'>(
    'idle'
  );

  useEffect(() => {
    void (async () => {
      const p = await loadDownloadProgress();
      setSavedProgress(p);
    })();
  }, []);

  const downloading = busyAction === 'download';
  const downloadPct = Math.round(manualProgress * 100);
  const remote = isRemoteModelUrl(pathOrUrl);
  const sourceLabel = remote
    ? 'HuggingFace URL (download)'
    : `local · ${pathOrUrl.split(/[/\\]/).pop() ?? pathOrUrl}`;

  const onDownload = useCallback(() => {
    setLocalError(null);
    setBusyAction('download');
    setManualProgress(0);
    void (async () => {
      try {
        if (!isRemoteModelUrl(pathOrUrl)) {
          setLocalError('Source is already local. Tap Load model instead.');
          return;
        }
        const localPath = await downloadModelWithRetry(pathOrUrl, {
          attempts: 3,
          onProgress: (p) => {
            setManualProgress(p);
            void saveDownloadProgress(p);
          },
        });
        await saveModelSource(localPath);
        await clearDownloadProgress();
        onSourceChange(localPath);
      } catch (err: unknown) {
        setLocalError(describeDownloadError(err));
        try {
          ModelRegistry.deleteFile(pathOrUrl);
        } catch {
          // ignore
        }
      } finally {
        setBusyAction('idle');
      }
    })();
  }, [onSourceChange, pathOrUrl]);

  const onImportFromFilesystem = useCallback(() => {
    setLocalError(null);
    setBusyAction('import');
    void (async () => {
      try {
        const { importLitertModelFromPicker } =
          await import('../src/device/import-model');
        const result = await importLitertModelFromPicker();
        if (!result.ok) {
          if (result.error !== 'Import cancelled.') {
            setLocalError(result.error);
          }
          return;
        }
        onSourceChange(result.path);
      } catch (err: unknown) {
        setLocalError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusyAction('idle');
      }
    })();
  }, [onSourceChange]);

  const onResetToDefaultUrl = useCallback(() => {
    setLocalError(null);
    void (async () => {
      try {
        try {
          ModelRegistry.deleteFile(DEFAULT_MODEL_URL);
        } catch {
          // ignore
        }
        await saveModelSource(DEFAULT_MODEL_URL);
        onSourceChange(DEFAULT_MODEL_URL);
      } catch (err: unknown) {
        setLocalError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, [onSourceChange]);

  const onLoadTap = useCallback(() => {
    setLocalError(null);
    if (remote) {
      setLocalError('Download first, then Load model on the local file.');
      return;
    }
    try {
      assertModelFileUsable(pathOrUrl);
    } catch (err: unknown) {
      setLocalError(err instanceof Error ? err.message : String(err));
      return;
    }
    onArmEngine();
  }, [onArmEngine, pathOrUrl, remote]);

  return (
    <View style={styles.block}>
      <Text style={styles.label}>
        LiteRT · Gemma 4 E2B · backend {backend}
        {decision.warnings.length > 0
          ? ` · ${decision.warnings.join('; ')}`
          : ''}
      </Text>
      <Text style={styles.meta}>source · {sourceLabel}</Text>
      <Text style={styles.meta}>
        Engine stays unloaded until you tap Load model. Incomplete downloads
        (&lt;2 GB for Gemma E2B) are rejected before native load. One shared
        engine with Chat — unload frees RAM without deleting the file.
      </Text>

      {remote ? (
        <Pressable
          style={[styles.button, downloading && styles.buttonDisabled]}
          onPress={onDownload}
          disabled={busyAction !== 'idle'}
        >
          {busyAction === 'download' ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.buttonText}>
              {downloading
                ? `downloading ${downloadPct}%`
                : savedProgress > 0 && savedProgress < 1
                  ? `retry full download (${Math.round(savedProgress * 100)}% was progress UI only)`
                  : 'download (~2.6 GB, 3 full retries)'}
            </Text>
          )}
        </Pressable>
      ) : null}

      {downloading ? (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${downloadPct}%` }]} />
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

      {!remote && !engineArmed ? (
        <Pressable
          style={[
            styles.button,
            busyAction !== 'idle' && styles.buttonDisabled,
          ]}
          onPress={onLoadTap}
          disabled={busyAction !== 'idle'}
        >
          <Text style={styles.buttonText}>Load model</Text>
        </Pressable>
      ) : null}

      <Pressable style={styles.linkBtn} onPress={onResetToDefaultUrl}>
        <Text style={styles.link}>reset source to default download URL</Text>
      </Pressable>

      <Text style={styles.meta}>
        Prefer: download gemma-4-E2B-it.litertlm on a PC, copy to the phone,
        then Import. Chat uses this file when generator is On this phone.
      </Text>

      {localError ? <Text style={styles.error}>{localError}</Text> : null}
    </View>
  );
}

export default function OnDeviceScreen() {
  const router = useRouter();
  const [caps, setCaps] = useState<DeviceCapabilities | null>(null);
  const [decision, setDecision] = useState<PolicyDecision | null>(null);
  const [busy, setBusy] = useState(true);
  const [modelSource, setModelSource] = useState(DEFAULT_MODEL_URL);
  const [engineArmed, setEngineArmed] = useState(false);
  const [engineMessage, setEngineMessage] = useState<string | null>(null);

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
        setEngineArmed(false);
        setEngineMessage(null);
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

  const onSourceChange = useCallback((next: string) => {
    setModelSource(next);
    setEngineArmed(false);
    setEngineMessage(null);
  }, []);

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
          First step for standalone phone chat: download or import a .litertlm
          file, then tap Load model. Conversation lives in Chat — this screen is
          not a second chat.
        </Text>
        {canSetup && !engineArmed ? (
          <Text style={styles.ctaHint}>
            ↓ Use Download (~2.6 GB) or Import .litertlm, then Load model.
          </Text>
        ) : null}

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
              <>
                <ModelSourcePanel
                  pathOrUrl={modelSource}
                  backend={backend}
                  decision={decision}
                  engineArmed={engineArmed}
                  onSourceChange={onSourceChange}
                  onArmEngine={() => {
                    setEngineMessage(null);
                    setEngineArmed(true);
                  }}
                />
                {engineArmed ? (
                  <ModelEngineHost
                    key={modelSource}
                    pathOrUrl={modelSource}
                    backend={backend}
                    onReprobe={probePolicy}
                    onLoaded={(detail) => {
                      setEngineMessage(detail);
                    }}
                    onFailed={(message) => {
                      setEngineArmed(false);
                      setEngineMessage(`load failed · ${message}`);
                    }}
                    onUnloadRequest={() => {
                      setEngineArmed(false);
                      setEngineMessage(null);
                    }}
                  />
                ) : null}
                {engineMessage ? (
                  <Text
                    style={
                      engineMessage.startsWith('load failed')
                        ? styles.error
                        : styles.meta
                    }
                  >
                    {engineMessage}
                  </Text>
                ) : null}
              </>
            ) : null}
          </>
        )}

        <Section title="Chat">
          <PrimaryButton
            label="open chat (on this phone)"
            onPress={() => {
              void (async () => {
                await saveGeneratorMode('litert');
                router.push('/chat');
              })();
            }}
          />
          <NavRow
            label="Open chat"
            subtitle="Always /chat — pick generator there"
            onPress={() => {
              router.push('/chat');
            }}
          />
          <NavRow
            label="Provider settings"
            onPress={() => {
              router.push('/settings');
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
  ctaHint: {
    color: colors.accent,
    fontFamily: fonts.mono,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 20,
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
