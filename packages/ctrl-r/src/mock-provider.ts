import { agentEventSchema, type AgentEvent } from '@involvex/ctrl-s';
import type {
  GenerateRequest,
  ModelCapabilities,
  ModelDescriptor,
  ModelProvider,
  ProviderContext,
} from './types';

/**
 * Deterministic echo provider for local/dev and contract tests.
 *
 * When `req.tools` is set, a user message of the form
 * `!call <toolName> {json}` emits `tool.requested` + finishReason `tool_calls`
 * so the agent loop can exercise LLM-native tool calling without a real LLM.
 */
export class MockProvider implements ModelProvider {
  readonly id = 'mock';

  capabilities(): Promise<ModelCapabilities> {
    return Promise.resolve({ streaming: true, tools: true });
  }

  listModels(): Promise<ModelDescriptor[]> {
    return Promise.resolve([{ id: 'mock-echo', displayName: 'Mock Echo' }]);
  }

  async *generate(
    req: GenerateRequest,
    ctx: ProviderContext = {}
  ): AsyncIterable<AgentEvent> {
    let userText = '';
    for (let i = req.messages.length - 1; i >= 0; i--) {
      const message = req.messages[i];
      if (message?.role === 'user') {
        userText = message.content;
        break;
      }
    }

    yield agentEventSchema.parse({ type: 'run.started', runId: req.runId });

    if (req.tools && req.tools.length > 0) {
      // After a tool round, wrap up instead of re-emitting the same !call.
      const hasToolResult = req.messages.some((m) => m.role === 'tool');
      if (hasToolResult) {
        const reply = 'mock: tool round complete';
        yield agentEventSchema.parse({ type: 'message.delta', text: reply });
        yield agentEventSchema.parse({
          type: 'usage.updated',
          usage: {
            promptTokens: userText.length,
            completionTokens: reply.length,
            totalTokens: userText.length + reply.length,
          },
        });
        yield agentEventSchema.parse({
          type: 'run.completed',
          finishReason: 'stop',
        });
        return;
      }

      const directive = parseCallDirective(userText);
      if (directive) {
        const allowed = req.tools.some((t) => t.name === directive.name);
        if (!allowed) {
          yield agentEventSchema.parse({
            type: 'run.failed',
            error: {
              code: 'unknown_tool',
              message: `mock provider: tool ${directive.name} not in request tools`,
            },
          });
          return;
        }
        if (ctx.signal?.aborted) {
          yield agentEventSchema.parse({
            type: 'run.failed',
            error: { code: 'aborted', message: 'cancelled' },
          });
          return;
        }
        yield agentEventSchema.parse({
          type: 'tool.requested',
          call: {
            id: `call_${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`,
            name: directive.name,
            arguments: directive.args,
          },
        });
        yield agentEventSchema.parse({
          type: 'run.completed',
          finishReason: 'tool_calls',
        });
        return;
      }
    }

    const reply = `mock: ${userText}`;
    const chunks = reply.match(/.{1,12}/g) ?? [reply];

    for (const text of chunks) {
      if (ctx.signal?.aborted) {
        yield agentEventSchema.parse({
          type: 'run.failed',
          error: { code: 'aborted', message: 'cancelled' },
        });
        return;
      }
      yield agentEventSchema.parse({ type: 'message.delta', text });
      await Bun.sleep(20);
    }
    yield agentEventSchema.parse({
      type: 'usage.updated',
      usage: {
        promptTokens: userText.length,
        completionTokens: reply.length,
        totalTokens: userText.length + reply.length,
      },
    });
    yield agentEventSchema.parse({
      type: 'run.completed',
      finishReason: 'stop',
    });
  }
}

/** Parse `!call <name> {json}` or `!call <name>` from user text. */
export function parseCallDirective(
  text: string
): { name: string; args: Record<string, unknown> } | null {
  const match = /^!call\s+([a-zA-Z0-9_-]+)\s*([\s\S]*)$/.exec(text.trim());
  if (!match) {
    return null;
  }
  const name = match[1]!;
  const rest = (match[2] ?? '').trim();
  if (!rest) {
    return { name, args: {} };
  }
  try {
    const parsed: unknown = JSON.parse(rest);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const args: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(parsed)) {
        args[k] = v;
      }
      return { name, args };
    }
  } catch {
    if (name === 'shell') {
      return { name, args: { command: rest } };
    }
    if (name === 'fs_read' || name === 'fs_list') {
      return { name, args: { path: rest } };
    }
  }
  return { name, args: { input: rest } };
}
