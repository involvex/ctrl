import { describe, expect, test } from 'bun:test';
import { getProviderStatus, updateProviderConfig } from '@involvex/ctrl-i';
import { providerStatusResponseSchema } from '@involvex/ctrl-s';
import { baseUrl } from './env';

describe('contract: GET/PATCH /api/v1/provider', () => {
  test('returns catalog and persists active selection', async () => {
    const before = providerStatusResponseSchema.parse(
      await getProviderStatus(baseUrl())
    );
    expect(before.providers.length).toBeGreaterThan(0);
    expect(before.providers.some((p) => p.id === 'mock')).toBe(true);

    const patched = providerStatusResponseSchema.parse(
      await updateProviderConfig(baseUrl(), { active: 'mock', model: 'echo' })
    );
    expect(patched.active).toBe('mock');
    expect(patched.model).toBe('echo');

    const after = providerStatusResponseSchema.parse(
      await getProviderStatus(baseUrl())
    );
    expect(after.active).toBe('mock');
    expect(after.model).toBe('echo');

    // Restore prior selection when it was something else.
    if (before.active !== 'mock' || before.model !== patched.model) {
      await updateProviderConfig(baseUrl(), {
        active: before.active,
        ...(before.model ? { model: before.model } : {}),
      });
    }
  });
});
