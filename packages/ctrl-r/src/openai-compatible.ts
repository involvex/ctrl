import { agentEventSchema, type AgentEvent } from '@involvex/ctrl-s';
import type {
  ChatMessage,
  GenerateRequest,
  ModelCapabilities,
  ModelDescriptor,
  ModelProvider,
  ProviderContext,
} from './types';

export type OpenAICompatibleConfig = {
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
};

type ChatCompletionChunk = {
  choices?: Array<{
    delta?: { content?: string | null };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

/**
 * Streams chat completions from any OpenAI-compatible `/v1/chat/completions`
 * endpoint (OpenAI, local llama-server, OpenRouter, etc.).
 */
export class OpenAICompatibleProvider implements ModelProvider {
  readonly id = 'openai-compatible';
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly defaultModel: string;

  constructor(config: OpenAICompatibleConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? 'https://api.openai.com/v1').replace(
      /\/$/,
      ''
    );
    this.defaultModel = config.defaultModel ?? 'gpt-4o-mini';
  }

  capabilities(): Promise<ModelCapabilities> {
    return Promise.resolve({ streaming: true, tools: false });
  }

  listModels(): Promise<ModelDescriptor[]> {
    return Promise.resolve([
      {
        id: this.defaultModel,
        displayName: this.defaultModel,
      },
    ]);
  }

  async *generate(
    req: GenerateRequest,
    ctx: ProviderContext = {}
  ): AsyncIterable<AgentEvent> {
    const model = req.model ?? this.defaultModel;
    yield agentEventSchema.parse({ type: 'run.started', runId: req.runId });

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          stream: true,
          messages: toOpenAIMessages(req.messages),
        }),
        signal: ctx.signal,
      });
    } catch (err) {
      yield agentEventSchema.parse({
        type: 'run.failed',
        error: {
          code: 'provider_fetch',
          message: err instanceof Error ? err.message : String(err),
        },
      });
      return;
    }

    if (!response.ok || !response.body) {
      const detail = await response.text().catch(() => '');
      yield agentEventSchema.parse({
        type: 'run.failed',
        error: {
          code: `http_${response.status}`,
          message: detail || response.statusText || 'provider error',
        },
      });
      return;
    }

    let completionChars = 0;
    let finishReason = 'stop';
    let sawUsage = false;

    for await (const line of readSseLines(response.body)) {
      if (ctx.signal?.aborted) {
        yield agentEventSchema.parse({
          type: 'run.failed',
          error: { code: 'aborted', message: 'cancelled' },
        });
        return;
      }
      if (!line.startsWith('data:')) {
        continue;
      }
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') {
        break;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(payload);
      } catch {
        continue;
      }
      if (!parsed || typeof parsed !== 'object') {
        continue;
      }
      const chunk = parsed as {
        choices?: ChatCompletionChunk['choices'];
        usage?: ChatCompletionChunk['usage'];
      };
      const choice = chunk.choices?.[0];
      const text = choice?.delta?.content;
      if (typeof text === 'string' && text.length > 0) {
        completionChars += text.length;
        yield agentEventSchema.parse({ type: 'message.delta', text });
      }
      if (choice?.finish_reason) {
        finishReason = choice.finish_reason;
      }
      if (chunk.usage) {
        sawUsage = true;
        yield agentEventSchema.parse({
          type: 'usage.updated',
          usage: {
            promptTokens: chunk.usage.prompt_tokens ?? 0,
            completionTokens: chunk.usage.completion_tokens ?? 0,
            totalTokens: chunk.usage.total_tokens ?? 0,
          },
        });
      }
    }

    if (!sawUsage && completionChars > 0) {
      yield agentEventSchema.parse({
        type: 'usage.updated',
        usage: {
          promptTokens: 0,
          completionTokens: completionChars,
          totalTokens: completionChars,
        },
      });
    }

    yield agentEventSchema.parse({
      type: 'run.completed',
      finishReason,
    });
  }
}

function toOpenAIMessages(
  messages: ChatMessage[]
): Array<{ role: string; content: string }> {
  return messages.map((m) => ({ role: m.role, content: m.content }));
}

async function* readSseLines(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split(/\r?\n/);
    buffer = parts.pop() ?? '';
    for (const part of parts) {
      const line = part.trimEnd();
      if (line.length > 0) {
        yield line;
      }
    }
  }
  if (buffer.trim().length > 0) {
    yield buffer.trimEnd();
  }
}
