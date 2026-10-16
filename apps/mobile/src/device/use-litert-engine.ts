import { useCallback, useEffect, useState } from 'react';
import { evaluateOnDevicePolicy, type PolicyDecision } from '@involvex/ctrl-s';
import { useModel } from 'react-native-litert-lm';
import { backendForPolicy, probeDeviceCapabilities } from './capabilities';
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
};

/**
 * Shared LiteRT engine for the single chat UI.
 * Policy failure only disables this generator — callers keep other modes.
 */
export function useLitertEngine(systemPrompt: string) {
  const [modelSource, setModelSource] = useState(DEFAULT_MODEL_URL);
  const [decision, setDecision] = useState<PolicyDecision | null>(null);
  const [capsReady, setCapsReady] = useState(false);
  const [unavailableReason, setUnavailableReason] = useState<string | null>(
    null
  );

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
      if (!cancelled) {
        setModelSource(saved);
      }
      await probe();
      if (!cancelled) {
        setCapsReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [probe]);

  const backend = backendForPolicy(decision?.backend ?? null);
  const autoLoad =
    capsReady &&
    Boolean(decision?.allowed) &&
    !isRemoteModelUrl(modelSource) &&
    !unavailableReason;

  const engine = useModel(modelSource, {
    backend,
    autoLoad,
    enableMemoryTracking: true,
    systemPrompt,
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
      if (!engine.isReady) {
        if (isRemoteModelUrl(modelSource)) {
          throw new Error(
            'Model not downloaded. Open Model setup to download or import a .litertlm file.'
          );
        }
        await engine.load();
      }
      return engine.generate(prompt.trim());
    },
    [engine, modelSource, probe]
  );

  const status: LitertEngineStatus = {
    ready: engine.isReady && !unavailableReason,
    generating: engine.isGenerating,
    unavailableReason: unavailableReason ?? engine.error,
    decision,
    modelSource,
  };

  return { status, generate, probe, setModelSource };
}
