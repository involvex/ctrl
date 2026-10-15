import type { ModelProvider } from '@involvex/ctrl-r';
import {
  agentEventSchema,
  type AgentEvent,
  type AgentProfile,
  type ToolCall,
} from '@involvex/ctrl-s';
import type { ApprovalGate } from './approval';
import type { ToolRegistry } from './registry';

export type AgentRunInput = {
  runId: string;
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  profile: AgentProfile;
  signal?: AbortSignal;
};

export type AgentLoopDeps = {
  provider: ModelProvider;
  registry: ToolRegistry;
  approvals: ApprovalGate;
  approvalTimeoutMs?: number;
  sandboxRoot: string;
};

/**
 * Phase 2 agent loop:
 * 1. Detect deterministic tool intents from the last user message (`/tool name {...}`).
 * 2. Otherwise stream a normal provider completion.
 * Tool calls that require approval wait on the ApprovalGate.
 */
export async function* runAgentLoop(
  input: AgentRunInput,
  deps: AgentLoopDeps
): AsyncIterable<AgentEvent> {
  const { runId, messages, profile, signal } = input;
  const timeoutMs = profile.runTimeoutMs;
  const signals: AbortSignal[] = [AbortSignal.timeout(timeoutMs)];
  if (signal) {
    signals.push(signal);
  }
  const controller = AbortSignal.any(signals);

  yield agentEventSchema.parse({ type: 'run.started', runId });

  let userText = '';
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.role === 'user') {
      userText = message.content;
      break;
    }
  }
  const toolIntent = parseToolIntent(userText);

  if (toolIntent) {
    if (
      profile.toolNames.length > 0 &&
      !profile.toolNames.includes(toolIntent.name)
    ) {
      yield agentEventSchema.parse({
        type: 'run.failed',
        error: {
          code: 'tool_not_allowed',
          message: `tool ${toolIntent.name} is not enabled on this profile`,
        },
      });
      return;
    }

    const registered = deps.registry.get(toolIntent.name);
    if (!registered) {
      yield agentEventSchema.parse({
        type: 'run.failed',
        error: {
          code: 'unknown_tool',
          message: `unknown tool: ${toolIntent.name}`,
        },
      });
      return;
    }

    const call: ToolCall = {
      id: `call_${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`,
      name: toolIntent.name,
      arguments: toolIntent.args,
    };

    yield agentEventSchema.parse({ type: 'tool.requested', call });

    const needsApproval =
      registered.definition.requiresApproval ||
      profile.requireApprovalFor.includes(call.name);

    if (needsApproval) {
      const approvalId = `apr_${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`;
      const risk = registered.definition.risk;
      const waitMs = deps.approvalTimeoutMs ?? 60_000;
      yield agentEventSchema.parse({
        type: 'approval.requested',
        approvalId,
        call,
        risk,
        timeoutMs: waitMs,
      });
      const decision = await deps.approvals.request({
        approvalId,
        call,
        risk,
        timeoutMs: waitMs,
      });
      yield agentEventSchema.parse({
        type: 'approval.resolved',
        approvalId,
        decision,
      });
      if (decision !== 'approved') {
        yield agentEventSchema.parse({
          type: 'message.delta',
          text: `Tool \`${call.name}\` was ${decision}.`,
        });
        yield agentEventSchema.parse({
          type: 'run.completed',
          finishReason: decision === 'denied' ? 'tool_denied' : 'tool_timeout',
        });
        return;
      }
    }

    if (controller.aborted) {
      yield cancelled(runId, controller);
      return;
    }

    yield agentEventSchema.parse({ type: 'tool.started', callId: call.id });
    try {
      const result = await registered.execute(call, {
        signal: controller,
        sandboxRoot: deps.sandboxRoot,
      });
      yield agentEventSchema.parse({
        type: 'tool.completed',
        callId: call.id,
        result,
      });
      const summary = formatToolResult(call.name, result);
      yield agentEventSchema.parse({ type: 'message.delta', text: summary });
      yield agentEventSchema.parse({
        type: 'run.completed',
        finishReason: 'tool',
      });
    } catch (err) {
      if (controller.aborted) {
        yield cancelled(runId, controller);
        return;
      }
      yield agentEventSchema.parse({
        type: 'run.failed',
        error: {
          code: 'tool_error',
          message: err instanceof Error ? err.message : String(err),
        },
      });
    }
    return;
  }

  // Normal chat via provider
  try {
    for await (const event of deps.provider.generate(
      { runId, messages },
      { signal: controller }
    )) {
      if (event.type === 'run.started') {
        continue;
      }
      yield event;
      if (event.type === 'run.completed' || event.type === 'run.failed') {
        return;
      }
    }
  } catch (err) {
    if (controller.aborted) {
      yield cancelled(runId, controller);
      return;
    }
    yield agentEventSchema.parse({
      type: 'run.failed',
      error: {
        code: 'provider_error',
        message: err instanceof Error ? err.message : String(err),
      },
    });
  }
}

function cancelled(runId: string, signal: AbortSignal): AgentEvent {
  const reason =
    signal.reason instanceof Error
      ? signal.reason.message
      : typeof signal.reason === 'string'
        ? signal.reason
        : 'cancelled';
  return agentEventSchema.parse({
    type: 'run.cancelled',
    runId,
    reason,
  });
}

/** Parse `/tool <name> {json}` or `/tool <name>` from user text. */
export function parseToolIntent(
  text: string
): { name: string; args: Record<string, unknown> } | null {
  const match = /^\/tool\s+([a-zA-Z0-9_-]+)\s*([\s\S]*)$/.exec(text.trim());
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
      return { name, args: parsed as Record<string, unknown> };
    }
  } catch {
    // treat remainder as shell command for convenience
    if (name === 'shell') {
      return { name, args: { command: rest } };
    }
    if (name === 'fs_read' || name === 'fs_list') {
      return { name, args: { path: rest } };
    }
  }
  return { name, args: { input: rest } };
}

function formatToolResult(name: string, result: unknown): string {
  const body =
    typeof result === 'string' ? result : JSON.stringify(result, null, 2);
  return `### tool \`${name}\`\n\`\`\`json\n${body}\n\`\`\`\n`;
}
