import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { evaluateOnDevicePolicy, type PolicyDecision } from '@involvex/ctrl-s';
import { backendForPolicy, probeDeviceCapabilities } from './capabilities';
import { policyRequestForSource } from './model-catalog-pure';
import {
  ensureLitertLoaded,
  generateWithLitert,
  isLitertEngineLoaded,
  unloadLitertEngine,
} from './litert-engine';
import { assertModelFileUsable, readModelFileBytes } from './model-size';
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
  const modelSourceRef = useRef(modelSource);
  useEffect(() => {
    modelSourceRef.current = modelSource;
  }, [modelSource]);
  const [decision, setDecision] = useState<PolicyDecision | null>(null);
  const [unavailableReason, setUnavailableReason] = useState<string | null>(
    null
  );
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [ready, setReady] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [engineError, setEngineError] = useState<string | null>(null);

  const probe = useCallback(async (pathForPolicy?: string) => {
    const caps = await probeDeviceCapabilities();
    const path = pathForPolicy ?? modelSourceRef.current;
    const bytes = isRemoteModelUrl(path) ? 0 : readModelFileBytes(path);
    const policy = evaluateOnDevicePolicy(
      caps,
      policyRequestForSource(path, bytes > 0 ? bytes : undefined)
    );
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
      await probe(saved);
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
      // Re-read active path — Model setup may have switched while chat stayed mounted.
      const saved = await loadSavedModelSource();
      setModelSource(saved);
      if (isRemoteModelUrl(saved)) {
        throw new Error(
          'Model not downloaded. Open Model setup to download or import a .litertlm file.'
        );
      }
      const fresh = await probe(saved);
      if (!fresh.allowed) {
        throw new Error(
          `On-device blocked: ${fresh.reasons.join('; ') || 'not allowed'}`
        );
      }
      assertModelFileUsable(saved);
      const backend = backendForPolicy(fresh.backend);
      setLoadedOnce(true);
      setGenerating(true);
      try {
        await ensureLitertLoaded({
          path: saved,
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
    [frozenPrompt, probe]
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
