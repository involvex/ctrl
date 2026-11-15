import type { AgentEvent, ToolCall } from '@involvex/ctrl-s';
import type { ApprovalGate, ApprovalRequest } from '@involvex/ctrl-x';
import { createApprovalGate } from '@involvex/ctrl-x';

export type ApprovalSource = 'chat' | 'channel';

export type ApprovalRunContext = {
  workspaceId: string;
  conversationId: string;
  runId: string;
  source: ApprovalSource;
  channelId?: string;
};

type PendingEntry = ApprovalRunContext & {
  approvalId: string;
  call: ToolCall;
  risk: 'low' | 'high';
  timeoutMs: number;
  gate: ApprovalGate;
};

export type ApprovalSubscriber = {
  id: string;
  workspaceId: string;
  send: (payload: string) => void;
};

/** `timeout` keeps the gate timer; `deny` resolves immediately when nobody listens. */
export type ChannelApprovalFallback = 'timeout' | 'deny';

export function channelApprovalFallbackFromEnv(
  env: NodeJS.Dict<string> = process.env
): ChannelApprovalFallback {
  const raw = env['CTRL_CHANNEL_APPROVAL_FALLBACK']?.trim().toLowerCase();
  return raw === 'timeout' ? 'timeout' : 'deny';
}

export type ApprovalBroker = {
  subscribe: (sub: ApprovalSubscriber) => void;
  unsubscribe: (id: string) => void;
  subscriberCount: (workspaceId: string) => number;
  /** Wrap a gate so requests register + fan out; channel may deny with no listeners. */
  wrapGate: (
    gate: ApprovalGate,
    ctx: ApprovalRunContext,
    opts?: { channelFallback?: ChannelApprovalFallback }
  ) => ApprovalGate;
  resolve: (approvalId: string, decision: 'approved' | 'denied') => boolean;
};

export function createApprovalBroker(): ApprovalBroker {
  const pending = new Map<string, PendingEntry>();
  const subscribers = new Map<string, ApprovalSubscriber>();

  const fanout = (workspaceId: string, event: AgentEvent): void => {
    const body = JSON.stringify(event);
    for (const sub of subscribers.values()) {
      if (sub.workspaceId === workspaceId) {
        try {
          sub.send(body);
        } catch {
          // drop broken subscriber send
        }
      }
    }
  };

  const broker: ApprovalBroker = {
    subscribe(sub) {
      subscribers.set(sub.id, sub);
    },
    unsubscribe(id) {
      subscribers.delete(id);
    },
    subscriberCount(workspaceId) {
      let n = 0;
      for (const sub of subscribers.values()) {
        if (sub.workspaceId === workspaceId) {
          n += 1;
        }
      }
      return n;
    },
    wrapGate(gate, ctx, opts) {
      const channelFallback =
        opts?.channelFallback ?? channelApprovalFallbackFromEnv();

      return {
        request(req: ApprovalRequest) {
          if (
            ctx.source === 'channel' &&
            channelFallback === 'deny' &&
            broker.subscriberCount(ctx.workspaceId) === 0
          ) {
            // No workspace listeners: deny immediately (avoid 60s stall on Telegram/etc).
            return Promise.resolve('denied' as const);
          }

          pending.set(req.approvalId, {
            ...ctx,
            approvalId: req.approvalId,
            call: req.call,
            risk: req.risk,
            timeoutMs: req.timeoutMs,
            gate,
          });

          const requested: AgentEvent = {
            type: 'approval.requested',
            approvalId: req.approvalId,
            call: req.call,
            risk: req.risk,
            timeoutMs: req.timeoutMs,
            source: ctx.source,
            workspaceId: ctx.workspaceId,
            conversationId: ctx.conversationId,
            runId: ctx.runId,
            ...(ctx.channelId ? { channelId: ctx.channelId } : {}),
          };
          fanout(ctx.workspaceId, requested);

          return gate.request(req).then((decision) => {
            pending.delete(req.approvalId);
            const resolved: AgentEvent = {
              type: 'approval.resolved',
              approvalId: req.approvalId,
              decision,
              source: ctx.source,
              workspaceId: ctx.workspaceId,
              conversationId: ctx.conversationId,
              runId: ctx.runId,
              ...(ctx.channelId ? { channelId: ctx.channelId } : {}),
            };
            fanout(ctx.workspaceId, resolved);
            return decision;
          });
        },
        resolve(approvalId, decision) {
          gate.resolve(approvalId, decision);
        },
      };
    },
    resolve(approvalId, decision) {
      const entry = pending.get(approvalId);
      if (!entry) {
        return false;
      }
      entry.gate.resolve(approvalId, decision);
      return true;
    },
  };

  return broker;
}

/** Convenience: fresh gate already wrapped for a run. */
export function createBrokeredApprovalGate(
  broker: ApprovalBroker,
  ctx: ApprovalRunContext,
  opts?: { channelFallback?: ChannelApprovalFallback }
): ApprovalGate {
  return broker.wrapGate(createApprovalGate(), ctx, opts);
}
