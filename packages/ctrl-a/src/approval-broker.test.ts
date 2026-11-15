import { describe, expect, test } from 'bun:test';
import { createApprovalGate } from '@involvex/ctrl-x';
import {
  channelApprovalFallbackFromEnv,
  createApprovalBroker,
} from './approval-broker';

function eventType(value: unknown): string | null {
  if (!value || typeof value !== 'object' || !('type' in value)) {
    return null;
  }
  const type = Reflect.get(value, 'type');
  return typeof type === 'string' ? type : null;
}

function eventSource(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || !('source' in value)) {
    return undefined;
  }
  const source = Reflect.get(value, 'source');
  return typeof source === 'string' ? source : undefined;
}

describe('approval-broker', () => {
  test('channelApprovalFallbackFromEnv defaults to deny', () => {
    expect(channelApprovalFallbackFromEnv({})).toBe('deny');
    expect(
      channelApprovalFallbackFromEnv({
        CTRL_CHANNEL_APPROVAL_FALLBACK: 'timeout',
      })
    ).toBe('timeout');
    expect(
      channelApprovalFallbackFromEnv({ CTRL_CHANNEL_APPROVAL_FALLBACK: 'deny' })
    ).toBe('deny');
  });

  test('no channel subscribers + deny fallback → immediate denied', async () => {
    const broker = createApprovalBroker();
    const gate = broker.wrapGate(
      createApprovalGate(),
      {
        workspaceId: 'ws_1',
        conversationId: 'c_1',
        runId: 'run_1',
        source: 'channel',
        channelId: 'ch_1',
      },
      { channelFallback: 'deny' }
    );
    const decision = await gate.request({
      approvalId: 'apr_1',
      call: { id: 't1', name: 'shell', arguments: { command: 'echo hi' } },
      risk: 'high',
      timeoutMs: 60_000,
    });
    expect(decision).toBe('denied');
  });

  test('subscriber receives fan-out and can resolve', async () => {
    const broker = createApprovalBroker();
    const events: unknown[] = [];
    broker.subscribe({
      id: 'sub_1',
      workspaceId: 'ws_1',
      send: (payload) => {
        events.push(JSON.parse(payload));
      },
    });
    const gate = broker.wrapGate(
      createApprovalGate(),
      {
        workspaceId: 'ws_1',
        conversationId: 'c_1',
        runId: 'run_1',
        source: 'channel',
        channelId: 'ch_1',
      },
      { channelFallback: 'deny' }
    );
    const pending = gate.request({
      approvalId: 'apr_2',
      call: { id: 't1', name: 'shell', arguments: { command: 'echo hi' } },
      risk: 'high',
      timeoutMs: 5_000,
    });
    expect(events.length).toBe(1);
    expect(eventType(events[0])).toBe('approval.requested');
    expect(eventSource(events[0])).toBe('channel');
    expect(broker.resolve('apr_2', 'approved')).toBe(true);
    await expect(pending).resolves.toBe('approved');
    expect(events.some((e) => eventType(e) === 'approval.resolved')).toBe(true);
  });
});
