import { Platform } from 'react-native';
import {
  evaluateOnDevicePolicy,
  type DeviceCapabilities,
  type InferenceBackend,
  type PolicyDecision,
} from '@involvex/ctrl-s';
import { probeDeviceCapabilities } from './capabilities';

export type OnDeviceSessionState = {
  capabilities: DeviceCapabilities;
  decision: PolicyDecision;
};

type LitertLlm = {
  loadModel: (
    model: string | { url?: string },
    opts: { backend: string }
  ) => Promise<void>;
  sendMessage: (text: string) => Promise<string>;
  execute?: (text: string, onToken: (t: string) => void) => Promise<string>;
  unloadModel?: () => Promise<void>;
};

type LitertModule = {
  createLLM?: () => LitertLlm;
  GEMMA_4_E2B_IT?: string;
};

const DEFAULT_MODEL = {
  modelId: 'GEMMA_4_E2B_IT',
  minMemoryMb: 4096,
  preferredBackend: 'cpu' as InferenceBackend,
};

export async function prepareOnDeviceSession(
  preferredBackend: InferenceBackend = 'cpu'
): Promise<OnDeviceSessionState> {
  const capabilities = await probeDeviceCapabilities();
  const decision = evaluateOnDevicePolicy(capabilities, {
    ...DEFAULT_MODEL,
    preferredBackend,
  });
  return { capabilities, decision };
}

export type StreamHandlers = {
  onToken: (text: string) => void;
  onDone: () => void;
  onError: (message: string) => void;
};

/**
 * Run a short on-device completion when LiteRT is present and policy allows.
 * Falls back to a clear error on unsupported hosts (web / missing native).
 */
export async function runOnDevicePrompt(
  prompt: string,
  backend: InferenceBackend,
  handlers: StreamHandlers
): Promise<void> {
  if (Platform.OS !== 'android') {
    handlers.onError('On-device inference is Android-only in Phase 6');
    return;
  }

  try {
    const litert = (await import('react-native-litert-lm')) as LitertModule;

    if (typeof litert.createLLM !== 'function') {
      handlers.onError('createLLM unavailable in this LiteRT build');
      return;
    }

    const modelConst = litert.GEMMA_4_E2B_IT ?? 'GEMMA_4_E2B_IT';
    const llm = litert.createLLM();
    await llm.loadModel(modelConst, { backend });
    if (typeof llm.execute === 'function') {
      await llm.execute(prompt, handlers.onToken);
    } else {
      const reply = await llm.sendMessage(prompt);
      handlers.onToken(reply);
    }
    if (typeof llm.unloadModel === 'function') {
      await llm.unloadModel();
    }
    handlers.onDone();
  } catch (err) {
    handlers.onError(err instanceof Error ? err.message : String(err));
  }
}
