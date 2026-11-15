import { describe, expect, test } from 'bun:test';
import type { MutableRefObject } from 'react';
import type { RunSession, StreamHandlers } from '@involvex/ctrl-i';
import { runProviderCascade, streamGatewayReply } from './cascade';
import type { ProviderEntry } from './stack';

function sessionRef(): MutableRefObject<RunSession | null> {
  return { current: null };
}

describe('runProviderCascade', () => {
  test('litert-only unpaired succeeds without trying cloud', async () => {
    const statuses: string[] = [];
    const providers: ProviderEntry[] = [
      {
        id: 'litert',
        label: 'On this phone',
        kind: 'litert',
        enabled: true,
      },
    ];
    const result = await runProviderCascade(providers, 'hello', {
      onStatus: (line) => {
        statuses.push(line);
      },
      onDelta: () => undefined,
      litertGenerate: () => Promise.resolve('local reply'),
      litertUnavailable: null,
      ensureConversation: async () => {
        throw new Error('should not hit gateway');
      },
      sessionRef: sessionRef(),
      gatewayUrl: null,
    });
    expect(result.text).toBe('local reply');
    expect(result.origin).toBe('local');
    expect(statuses.some((s) => /cloud/i.test(s))).toBe(false);
  });

  test('skips host providers quickly when gatewayUrl is null', async () => {
    const statuses: string[] = [];
    const providers: ProviderEntry[] = [
      { id: 'zen', label: 'Cloud', kind: 'zen', enabled: true },
      { id: 'gateway', label: 'This PC', kind: 'gateway', enabled: true },
      {
        id: 'litert',
        label: 'On this phone',
        kind: 'litert',
        enabled: true,
      },
    ];
    const result = await runProviderCascade(providers, 'hi', {
      onStatus: (line) => {
        statuses.push(line);
      },
      onDelta: () => undefined,
      litertGenerate: () => Promise.resolve('phone'),
      litertUnavailable: null,
      ensureConversation: async () => {
        throw new Error('should not hit gateway');
      },
      sessionRef: sessionRef(),
      gatewayUrl: null,
    });
    expect(result.origin).toBe('local');
    expect(statuses.some((s) => /trying Cloud/i.test(s))).toBe(false);
  });

  test('streamGatewayReply asks onApprovalRequested then resolveApproval', async () => {
    const decisions: Array<'approved' | 'denied'> = [];
    const ref = sessionRef();
    const connect = (
      _base: string,
      _id: string,
      _content: string,
      handlers: StreamHandlers
    ): RunSession => {
      const session: RunSession = {
        cancel() {
          // no-op
        },
        resolveApproval(_approvalId, decision) {
          decisions.push(decision);
        },
        close() {
          // no-op
        },
      };
      queueMicrotask(() => {
        handlers.onEvent({
          type: 'approval.requested',
          approvalId: 'apr_test',
          call: { id: 'c1', name: 'shell', arguments: { cmd: 'ls' } },
          risk: 'high',
          timeoutMs: 60_000,
        });
        handlers.onEvent({
          type: 'message.delta',
          text: 'ok',
        });
        handlers.onEvent({
          type: 'run.completed',
          finishReason: 'stop',
        });
      });
      return session;
    };

    const text = await streamGatewayReply(
      'http://127.0.0.1:7331',
      'cv_1',
      'run ls',
      () => undefined,
      ref,
      undefined,
      async () => 'approved',
      connect
    );
    expect(text).toBe('ok');
    expect(decisions).toEqual(['approved']);
  });

  test('streamGatewayReply auto-denies when no approval callback', async () => {
    const decisions: Array<'approved' | 'denied'> = [];
    const ref = sessionRef();
    const connect = (
      _base: string,
      _id: string,
      _content: string,
      handlers: StreamHandlers
    ): RunSession => {
      const session: RunSession = {
        cancel() {
          // no-op
        },
        resolveApproval(_approvalId, decision) {
          decisions.push(decision);
        },
        close() {
          // no-op
        },
      };
      queueMicrotask(() => {
        handlers.onEvent({
          type: 'approval.requested',
          approvalId: 'apr_deny',
          call: { id: 'c2', name: 'shell', arguments: {} },
          risk: 'high',
          timeoutMs: 1000,
        });
        handlers.onEvent({
          type: 'run.completed',
          finishReason: 'tool_denied',
        });
      });
      return session;
    };

    await streamGatewayReply(
      'http://127.0.0.1:7331',
      'cv_1',
      'x',
      () => undefined,
      ref,
      undefined,
      undefined,
      connect
    );
    expect(decisions).toEqual(['denied']);
  });
});
