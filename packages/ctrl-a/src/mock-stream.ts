import { type AgentEvent, agentEventSchema } from '@involvex/ctrl-s';

const DEMO_CHUNKS = ['ctrl', ' online', ' — ', 'gateway', ' stream', ' ok'];

/** Deterministic mock run for Phase 0 client wiring (no real model). */
export function* demoAgentEvents(
  runId = `demo-${Date.now()}`
): Generator<AgentEvent> {
  yield agentEventSchema.parse({ type: 'run.started', runId });
  for (const text of DEMO_CHUNKS) {
    yield agentEventSchema.parse({ type: 'message.delta', text });
  }
  yield agentEventSchema.parse({
    type: 'usage.updated',
    usage: { promptTokens: 0, completionTokens: 6, totalTokens: 6 },
  });
  yield agentEventSchema.parse({
    type: 'run.completed',
    finishReason: 'stop',
  });
}
