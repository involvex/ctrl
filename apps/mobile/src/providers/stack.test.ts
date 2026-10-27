import { describe, expect, test } from 'bun:test';
import { DEFAULT_PROVIDER_STACK, reorderProviders } from './stack';

describe('reorderProviders', () => {
  test('moves first to last', () => {
    const next = reorderProviders(
      structuredClone(DEFAULT_PROVIDER_STACK),
      0,
      2
    );
    expect(next.order).toEqual(['gateway', 'litert', 'zen']);
  });

  test('moves last to first', () => {
    const next = reorderProviders(
      structuredClone(DEFAULT_PROVIDER_STACK),
      2,
      0
    );
    expect(next.order).toEqual(['litert', 'zen', 'gateway']);
  });

  test('no-op on same index', () => {
    const base = structuredClone(DEFAULT_PROVIDER_STACK);
    const next = reorderProviders(base, 1, 1);
    expect(next.order).toEqual(base.order);
  });
});
