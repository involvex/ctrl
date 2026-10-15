import type { AgentEvent } from '@involvex/ctrl-s';
import type {
  GenerateRequest,
  ModelCapabilities,
  ModelDescriptor,
  ModelProvider,
  ProviderContext,
} from './types';

/**
 * Gateway-side LiteRT placeholder. Real inference runs on mobile via
 * react-native-litert-lm; selecting this on the gateway surfaces a clear error.
 */
export class LiteRTProvider implements ModelProvider {
  readonly id = 'litert';
  private readonly modelId: string;

  constructor(modelId = 'GEMMA_4_E2B_IT') {
    this.modelId = modelId;
  }

  capabilities(): Promise<ModelCapabilities> {
    return Promise.resolve({ streaming: true, tools: false });
  }

  listModels(): Promise<ModelDescriptor[]> {
    return Promise.resolve([{ id: this.modelId, displayName: this.modelId }]);
  }

  async *generate(
    _req: GenerateRequest,
    _ctx: ProviderContext = {}
  ): AsyncIterable<AgentEvent> {
    yield {
      type: 'run.failed',
      error: {
        code: 'litert_on_device_only',
        message:
          'LiteRT runs on the mobile app (on-device). Switch active provider on the phone, or use zen/kilo/llama/openai on the gateway.',
      },
    };
  }
}
