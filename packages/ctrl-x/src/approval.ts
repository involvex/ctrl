import type { ApprovalDecision, ToolCall } from '@involvex/ctrl-s';

export type ApprovalRequest = {
  approvalId: string;
  call: ToolCall;
  risk: 'low' | 'high';
  timeoutMs: number;
};

export type ApprovalGate = {
  request(req: ApprovalRequest): Promise<ApprovalDecision>;
  resolve(approvalId: string, decision: 'approved' | 'denied'): void;
};

/** In-process approval gate with timeout; gateway wires UI decisions into resolve(). */
export function createApprovalGate(): ApprovalGate {
  const pending = new Map<
    string,
    {
      resolve: (d: ApprovalDecision) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  return {
    request(req) {
      return new Promise<ApprovalDecision>((resolve) => {
        const timer = setTimeout(() => {
          pending.delete(req.approvalId);
          resolve('timeout');
        }, req.timeoutMs);
        pending.set(req.approvalId, { resolve, timer });
      });
    },
    resolve(approvalId, decision) {
      const entry = pending.get(approvalId);
      if (!entry) {
        return;
      }
      clearTimeout(entry.timer);
      pending.delete(approvalId);
      entry.resolve(decision);
    },
  };
}
