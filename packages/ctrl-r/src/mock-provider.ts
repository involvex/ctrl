import { agentEventSchema, type AgentEvent } from '@involvex/ctrl-s';
import type {
  GenerateRequest,
  ModelCapabilities,
  ModelDescriptor,
  ModelProvider,
  ProviderContext,
} from './types';

/** Deterministic echo provider for local/dev and contract tests. */
export class MockProvider implements ModelProvider {
  readonly id = 'mock';

  capabilities(): Promise<ModelCapabilities> {
    return Promise.resolve({ streaming: true, tools: false });
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
    const reply = `mock: ${userText}`;
    const chunks = reply.match(/.{1,12}/g) ?? [reply];

    yield agentEventSchema.parse({ type: 'run.started', runId: req.runId });
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
