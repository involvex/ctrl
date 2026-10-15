import type { AgentEvent, ToolDefinition } from '@involvex/ctrl-s';

export type ProviderToolCall = {
  id: string;
  name: string;
  arguments: string;
};

export type ChatMessage = {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  /** Present on assistant messages that requested tools. */
  toolCalls?: ProviderToolCall[];
  /** Present on tool-result messages. */
  toolCallId?: string;
};

export type GenerateRequest = {
  runId: string;
  messages: ChatMessage[];
  model?: string;
  /** When set, providers that support tools may emit tool.requested events. */
  tools?: ToolDefinition[];
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
