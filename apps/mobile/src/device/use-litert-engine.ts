import { useCallback, useEffect, useMemo, useState } from 'react';
import { evaluateOnDevicePolicy, type PolicyDecision } from '@involvex/ctrl-s';
import { backendForPolicy, probeDeviceCapabilities } from './capabilities';
import {
  ensureLitertLoaded,
  generateWithLitert,
  isLitertEngineLoaded,
  unloadLitertEngine,
} from './litert-engine';
import { assertModelFileUsable } from './model-size';
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
 * LiteRT status/generate API for chat — backed by the process singleton.
 * Does not call useModel (avoids a second native engine next to Model setup).
 */
export function useLitertEngine(systemPrompt: string) {
  const [frozenPrompt] = useState(systemPrompt);
  const [modelSource, setModelSource] = useState(DEFAULT_MODEL_URL);
  const [decision, setDecision] = useState<PolicyDecision | null>(null);
  const [unavailableReason, setUnavailableReason] = useState<string | null>(
    null
  );
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [ready, setReady] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [engineError, setEngineError] = useState<string | null>(null);

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
      try {
        assertModelFileUsable(saved);
      } catch (err) {
        setUnavailableReason(err instanceof Error ? err.message : String(err));
        return;
      }
      await probe();
      if (!cancelled) {
        setReady(isLitertEngineLoaded(saved));
        setLoadedOnce(isLitertEngineLoaded(saved));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [probe]);

  const generate = useCallback(
    async (prompt: string): Promise<string> => {
      setEngineError(null);
      const fresh = await probe();
      if (!fresh.allowed) {
        throw new Error(
          `On-device blocked: ${fresh.reasons.join('; ') || 'not allowed'}`
        );
      }
      assertModelFileUsable(modelSource);
      const backend = backendForPolicy(fresh.backend);
      setLoadedOnce(true);
      setGenerating(true);
      try {
        await ensureLitertLoaded({
          path: modelSource,
          backend,
          systemPrompt: frozenPrompt,
        });
        setReady(true);
        return await generateWithLitert(prompt);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setEngineError(message);
        setReady(false);
        throw err;
      } finally {
        setGenerating(false);
      }
    },
    [frozenPrompt, modelSource, probe]
  );

  const unload = useCallback(async () => {
    await unloadLitertEngine();
    setReady(false);
  }, []);

  const status: LitertEngineStatus = useMemo(
    () => ({
      ready: ready && !unavailableReason,
      generating,
      unavailableReason: unavailableReason ?? engineError,
      decision,
      modelSource,
      loadedOnce: loadedOnce || ready,
    }),
    [
      decision,
      engineError,
      generating,
      loadedOnce,
      modelSource,
      ready,
      unavailableReason,
    ]
  );

  return { status, generate, probe, setModelSource, unload };
}
