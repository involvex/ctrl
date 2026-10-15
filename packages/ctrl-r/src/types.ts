import type { AgentEvent } from '@involvex/ctrl-s';

export type ChatMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

export type GenerateRequest = {
  runId: string;
  messages: ChatMessage[];
  model?: string;
};

export type ProviderContext = {
  signal?: AbortSignal;
};

export type ModelCapabilities = {
  streaming: boolean;
  tools: boolean;
};

export type ModelDescriptor = {
  id: string;
  displayName: string;
};

export interface ModelProvider {
  id: string;
  capabilities(): Promise<ModelCapabilities>;
  listModels(): Promise<ModelDescriptor[]>;
  generate(
    req: GenerateRequest,
    ctx: ProviderContext
  ): AsyncIterable<AgentEvent>;
  cancel?(runId: string): Promise<void>;
}
