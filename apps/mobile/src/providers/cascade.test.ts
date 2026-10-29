import { describe, expect, test } from 'bun:test';
import type { MutableRefObject } from 'react';
import { runProviderCascade } from './cascade';
import type { ProviderEntry } from './stack';
import type { RunSession } from '@involvex/ctrl-i';

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
});
