import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_PROVIDER_STACK,
  providersForGenerator,
  reorderProviders,
} from './stack';

describe('reorderProviders', () => {
  test('moves first to last', () => {
    const next = reorderProviders(
      structuredClone(DEFAULT_PROVIDER_STACK),
      0,
      2
    );
    expect(next.order).toEqual(['gateway', 'zen', 'litert']);
  });

  test('moves last to first', () => {
    const next = reorderProviders(
      structuredClone(DEFAULT_PROVIDER_STACK),
      2,
      0
    );
    expect(next.order).toEqual(['zen', 'litert', 'gateway']);
  });

  test('no-op on same index', () => {
    const base = structuredClone(DEFAULT_PROVIDER_STACK);
    const next = reorderProviders(base, 1, 1);
    expect(next.order).toEqual(base.order);
  });
});

describe('providersForGenerator', () => {
  test('default order is litert-first', () => {
    expect(DEFAULT_PROVIDER_STACK.order).toEqual([
      'litert',
      'gateway',
      'zen',
    ]);
  });

  test('litert generator scopes to on-device only', () => {
    const scoped = providersForGenerator(
      structuredClone(DEFAULT_PROVIDER_STACK),
      'litert'
    );
    expect(scoped.map((p) => p.id)).toEqual(['litert']);
  });

  test('gateway generator prefers host then litert fallback', () => {
    const scoped = providersForGenerator(
      structuredClone(DEFAULT_PROVIDER_STACK),
      'gateway'
    );
    expect(scoped.map((p) => p.kind)).toEqual([
      'gateway',
      'zen',
      'litert',
    ]);
  });
});
