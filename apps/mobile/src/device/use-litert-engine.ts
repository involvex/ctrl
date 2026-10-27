import { useCallback, useEffect, useMemo, useState } from 'react';
import { evaluateOnDevicePolicy, type PolicyDecision } from '@involvex/ctrl-s';
import { useModel } from 'react-native-litert-lm';
import { backendForPolicy, probeDeviceCapabilities } from './capabilities';
import { ModelRegistry } from 'react-native-litert-lm';
import {
  DEFAULT_MODEL_URL,
  isRemoteModelUrl,
  loadSavedModelSource,
} from './model-source';

export type LitertEngineStatus = {
  ready: boolean;
  generating: boolean;
  unavailableReason: string | null;
  decision: PolicyDecision | null;
  modelSource: string;
  /** True after first successful load/generate attempt started. */
  loadedOnce: boolean;
};

/**
 * LiteRT engine for chat. Mount only when generator === 'litert'.
 * autoLoad is always false — load on first generate to avoid OOM on chat open.
 */
export function useLitertEngine(systemPrompt: string) {
  // Freeze prompt at mount so brain hydrate does not remount the native engine.
  const [frozenPrompt] = useState(systemPrompt);
  const [modelSource, setModelSource] = useState(DEFAULT_MODEL_URL);
  const [decision, setDecision] = useState<PolicyDecision | null>(null);
  const [unavailableReason, setUnavailableReason] = useState<string | null>(
    null
  );
  const [loadedOnce, setLoadedOnce] = useState(false);

  const probe = useCallback(async () => {
    const caps = await probeDeviceCapabilities();
    const policy = evaluateOnDevicePolicy(caps, {
      modelId: 'GEMMA_4_E2B_IT',
      minMemoryMb: 4096,
      preferredBackend: 'cpu',
    });
    setDecision(policy);
    if (!caps.litertAvailable) {
      setUnavailableReason(
        'LiteRT not linked on this build. Import a model from Model setup or use This PC / Cloud.'
      );
    } else if (!policy.allowed) {
      setUnavailableReason(
        `On-device blocked: ${policy.reasons.join('; ') || 'not allowed'}`
      );
    } else {
      setUnavailableReason(null);
    }
    return policy;
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const saved = await loadSavedModelSource();
      if (cancelled) {
        return;
      }
      setModelSource(saved);
      if (isRemoteModelUrl(saved)) {
        setUnavailableReason(
          'Model not downloaded. Open Model setup to download or import a .litertlm file.'
        );
        return;
      }
      let size = 0;
      try {
        size = ModelRegistry.getFileSizeBytes(saved);
      } catch {
        size = 0;
      }
      if (size <= 0) {
        setUnavailableReason(
          `Model file not readable. Re-import from Model setup.`
        );
        return;
      }
      await probe();
    })();
    return () => {
      cancelled = true;
    };
  }, [probe]);

  const backend = backendForPolicy(decision?.backend ?? null);

  const engine = useModel(modelSource, {
    backend,
    autoLoad: false,
    enableMemoryTracking: true,
    systemPrompt: frozenPrompt,
    maxOutputTokens: 512,
    maxContextTokens: 2048,
  });

  const generate = useCallback(
    async (prompt: string): Promise<string> => {
      const fresh = await probe();
      if (!fresh.allowed) {
        throw new Error(
          `On-device blocked: ${fresh.reasons.join('; ') || 'not allowed'}`
        );
      }
      if (isRemoteModelUrl(modelSource)) {
        throw new Error(
          'Model not downloaded. Open Model setup to download or import a .litertlm file.'
        );
      }
      let size = 0;
      try {
        size = ModelRegistry.getFileSizeBytes(modelSource);
      } catch {
        size = 0;
      }
      if (size <= 0) {
        throw new Error(
          `Model file not readable (${modelSource}). Re-import from Model setup.`
        );
      }
      if (!engine.isReady) {
        setLoadedOnce(true);
        await engine.load();
      }
      return engine.generate(prompt.trim());
    },
    [engine, modelSource, probe]
  );

  const status: LitertEngineStatus = useMemo(
    () => ({
      ready: engine.isReady && !unavailableReason,
      generating: engine.isGenerating,
      unavailableReason: unavailableReason ?? engine.error,
      decision,
      modelSource,
      loadedOnce: loadedOnce || engine.isReady,
    }),
    [
      decision,
      engine.error,
      engine.isGenerating,
      engine.isReady,
      loadedOnce,
      modelSource,
      unavailableReason,
    ]
  );

  return { status, generate, probe, setModelSource };
}
