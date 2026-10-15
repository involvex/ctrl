import type { ChatMessage, ModelProvider } from '@involvex/ctrl-r';
import {
  agentEventSchema,
  type AgentEvent,
  type AgentProfile,
  type ToolCall,
  type ToolDefinition,
} from '@involvex/ctrl-s';
import type { ApprovalGate } from './approval';
import type { ToolRegistry } from './registry';

export type AgentRunInput = {
  runId: string;
  messages: ChatMessage[];
  profile: AgentProfile;
  signal?: AbortSignal;
};

export type AgentLoopDeps = {
  provider: ModelProvider;
  registry: ToolRegistry;
  approvals: ApprovalGate;
  approvalTimeoutMs?: number;
  sandboxRoot: string;
  /** Max LLM↔tool rounds (default 5). */
  maxToolRounds?: number;
};

/**
 * Phase 2 agent loop:
 * 1. Detect deterministic tool intents from the last user message (`/tool name {...}`).
 * 2. Otherwise stream a provider completion, optionally with native tool calling.
 */
export async function* runAgentLoop(
  input: AgentRunInput,
  deps: AgentLoopDeps
): AsyncIterable<AgentEvent> {
  const { runId, profile, signal } = input;
  const timeoutMs = profile.runTimeoutMs;
  const signals: AbortSignal[] = [AbortSignal.timeout(timeoutMs)];
  if (signal) {
    signals.push(signal);
  }
  const controller = AbortSignal.any(signals);

  yield agentEventSchema.parse({ type: 'run.started', runId });

  let userText = '';
  for (let i = input.messages.length - 1; i >= 0; i--) {
    const message = input.messages[i];
    if (message?.role === 'user') {
      userText = message.content;
      break;
    }
  }
  const toolIntent = parseToolIntent(userText);

  if (toolIntent) {
    yield* executeSingleTool(toolIntent, input, deps, controller);
    return;
  }

  const caps = await deps.provider.capabilities();
  const tools = resolveToolsForProfile(deps.registry, profile);
  const messages: ChatMessage[] = [...input.messages];
  const maxRounds = deps.maxToolRounds ?? 5;

  for (let round = 0; round < maxRounds; round++) {
    if (controller.aborted) {
      yield cancelled(runId, controller);
      return;
    }

    const pending: ToolCall[] = [];
    let finishReason = 'stop';
    let sawTerminal = false;

    try {
      for await (const event of deps.provider.generate(
        {
          runId,
          messages,
          tools: caps.tools && tools.length > 0 ? tools : undefined,
        },
        { signal: controller }
      )) {
        if (event.type === 'run.started') {
          continue;
        }
        if (event.type === 'tool.requested') {
          pending.push(event.call);
          yield event;
          continue;
        }
        if (event.type === 'run.completed') {
          finishReason = event.finishReason;
          sawTerminal = true;
          if (finishReason === 'tool_calls' && pending.length > 0) {
            break;
          }
          yield event;
          return;
        }
        if (event.type === 'run.failed' || event.type === 'run.cancelled') {
          yield event;
          return;
        }
        yield event;
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
      return;
    }

    if (!sawTerminal || pending.length === 0 || finishReason !== 'tool_calls') {
      if (!sawTerminal) {
        yield agentEventSchema.parse({
          type: 'run.completed',
          finishReason: 'stop',
        });
      }
      return;
    }

    const assistantToolCalls = pending.map((call) => ({
      id: call.id,
      name: call.name,
      arguments: JSON.stringify(call.arguments ?? {}),
    }));
    messages.push({
      role: 'assistant',
      content: '',
      toolCalls: assistantToolCalls,
    });

    for (const call of pending) {
      if (
        profile.toolNames.length > 0 &&
        !profile.toolNames.includes(call.name)
      ) {
        yield agentEventSchema.parse({
          type: 'run.failed',
          error: {
            code: 'tool_not_allowed',
            message: `tool ${call.name} is not enabled on this profile`,
          },
        });
        return;
      }

      const outcome = yield* runRegisteredTool(
        call,
        deps,
        controller,
        profile,
        runId
      );
      if (outcome.kind === 'stop') {
        return;
      }
      messages.push({
        role: 'tool',
        content: JSON.stringify(outcome.result ?? null),
        toolCallId: call.id,
      });
    }
  }

  yield agentEventSchema.parse({
    type: 'run.failed',
    error: {
      code: 'tool_round_limit',
      message: `exceeded max tool rounds (${String(deps.maxToolRounds ?? 5)})`,
    },
  });
}

async function* executeSingleTool(
  toolIntent: { name: string; args: Record<string, unknown> },
  input: AgentRunInput,
  deps: AgentLoopDeps,
  controller: AbortSignal
): AsyncIterable<AgentEvent> {
  const { profile } = input;
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
  const outcome = yield* runRegisteredTool(
    call,
    deps,
    controller,
    profile,
    input.runId
  );
  if (outcome.kind === 'stop') {
    return;
  }
  const summary = formatToolResult(call.name, outcome.result);
  yield agentEventSchema.parse({ type: 'message.delta', text: summary });
  yield agentEventSchema.parse({
    type: 'run.completed',
    finishReason: 'tool',
  });
}

type ToolOutcome = { kind: 'ok'; result: unknown } | { kind: 'stop' };

async function* runRegisteredTool(
  call: ToolCall,
  deps: AgentLoopDeps,
  controller: AbortSignal,
  profile: AgentProfile,
  runId: string
): AsyncGenerator<AgentEvent, ToolOutcome> {
  const registered = deps.registry.get(call.name);
  if (!registered) {
    yield agentEventSchema.parse({
      type: 'run.failed',
      error: {
        code: 'unknown_tool',
        message: `unknown tool: ${call.name}`,
      },
    });
    return { kind: 'stop' };
  }

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
      return { kind: 'stop' };
    }
  }

  if (controller.aborted) {
    yield cancelled(runId, controller);
    return { kind: 'stop' };
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
    return { kind: 'ok', result };
  } catch (err) {
    if (controller.aborted) {
      yield cancelled(runId, controller);
      return { kind: 'stop' };
    }
    yield agentEventSchema.parse({
      type: 'run.failed',
      error: {
        code: 'tool_error',
        message: err instanceof Error ? err.message : String(err),
      },
    });
    return { kind: 'stop' };
  }
}

function resolveToolsForProfile(
  registry: ToolRegistry,
  profile: AgentProfile
): ToolDefinition[] {
  const all = registry.list();
  if (profile.toolNames.length === 0) {
    return all;
  }
  return all.filter((t) => profile.toolNames.includes(t.name));
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
      const args: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(parsed)) {
        args[k] = v;
      }
      return { name, args };
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
