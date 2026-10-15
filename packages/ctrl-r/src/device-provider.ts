import { agentEventSchema, type AgentEvent } from '@involvex/ctrl-s';
import type {
  ChatMessage,
  GenerateRequest,
  ModelCapabilities,
  ModelDescriptor,
  ModelProvider,
  ProviderContext,
} from './types';

export type DevicePairConfig = {
  gatewayUrl: string;
  token?: string;
};

/**
 * Forwards generate() to another ctrl gateway's demo/chat stream.
 * Used when a phone (or second host) pairs to a PC running ctrl-a.
 */
export class DevicePairProvider implements ModelProvider {
  readonly id = 'device';
  private readonly gatewayUrl: string;
  private readonly token: string;

  constructor(config: DevicePairConfig) {
    this.gatewayUrl = config.gatewayUrl.replace(/\/$/, '');
    this.token = config.token ?? '';
  }

  capabilities(): Promise<ModelCapabilities> {
    return Promise.resolve({ streaming: true, tools: true });
  }

  listModels(): Promise<ModelDescriptor[]> {
    return Promise.resolve([{ id: 'paired', displayName: 'Paired gateway' }]);
  }

  async *generate(
    req: GenerateRequest,
    ctx: ProviderContext = {}
  ): AsyncIterable<AgentEvent> {
    const lastUser = [...req.messages]
      .reverse()
      .find((m: ChatMessage) => m.role === 'user');
    const prompt = lastUser?.content ?? '';

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    let response: Response;
    try {
      response = await fetch(`${this.gatewayUrl}/api/v1/chat/stream`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          messages: req.messages,
          model: req.model,
          runId: req.runId,
        }),
        signal: ctx.signal,
      });
    } catch (err) {
      yield {
        type: 'run.failed',
        error: {
          code: 'device_pair_fetch',
          message: err instanceof Error ? err.message : String(err),
        },
      };
      return;
    }

    if (!response.ok || !response.body) {
      // Fallback: demo stream if full chat endpoint shape differs.
      yield* this.demoFallback(req, ctx, prompt);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n');
      buffer = parts.pop() ?? '';
      for (const line of parts) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) {
          continue;
        }
        const raw = trimmed.slice(5).trim();
        if (!raw || raw === '[DONE]') {
          continue;
        }
        try {
          const parsed = agentEventSchema.parse(JSON.parse(raw));
          yield parsed;
        } catch {
          // ignore malformed chunks
        }
      }
    }
  }

  private async *demoFallback(
    _req: GenerateRequest,
    ctx: ProviderContext,
    prompt: string
  ): AsyncIterable<AgentEvent> {
    const headers: Record<string, string> = {};
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    let response: Response;
    try {
      response = await fetch(
        `${this.gatewayUrl}/api/v1/demo/stream?q=${encodeURIComponent(prompt)}`,
        { headers, signal: ctx.signal }
      );
    } catch (err) {
      yield {
        type: 'run.failed',
        error: {
          code: 'device_pair_demo',
          message: err instanceof Error ? err.message : String(err),
        },
      };
      return;
    }
    if (!response.ok || !response.body) {
      yield {
        type: 'run.failed',
        error: {
          code: 'device_pair_http',
          message: `paired gateway ${response.status}`,
        },
      };
      return;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n');
      buffer = parts.pop() ?? '';
      for (const line of parts) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) {
          continue;
        }
        const raw = trimmed.slice(5).trim();
        if (!raw || raw === '[DONE]') {
          continue;
        }
        try {
          yield agentEventSchema.parse(JSON.parse(raw));
        } catch {
          // ignore
        }
      }
    }
  }
}
