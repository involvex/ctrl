import { describe, expect, test } from 'bun:test';
import { ProviderRuntime } from './runtime';

const emptyEnv = {} as NodeJS.ProcessEnv;

describe('ProviderRuntime', () => {
  test('defaults to mock without keys', () => {
    const runtime = new ProviderRuntime(emptyEnv);
    expect(runtime.getProvider().id).toBe('mock');
    const status = runtime.status();
    expect(status.active).toBe('mock');
    expect(status.providers.some((p) => p.id === 'zen')).toBe(true);
    expect(status.providers.some((p) => p.id === 'kilo')).toBe(true);
  });

  test('switches to zen with key', () => {
    const runtime = new ProviderRuntime(emptyEnv);
    const status = runtime.update({
      active: 'zen',
      zen: { apiKey: 'zen-test-key', model: 'deepseek-v4-pro' },
    });
    expect(status.active).toBe('zen');
    expect(runtime.getProvider().id).toBe('zen');
    expect(status.config.zen.apiKeySet).toBe(true);
  });

  test('switches to kilo with key', () => {
    const runtime = new ProviderRuntime(emptyEnv);
    runtime.update({
      active: 'kilo',
      kilo: { apiKey: 'kilo-test-key' },
    });
    expect(runtime.getProvider().id).toBe('kilo');
  });

  test('litert available when litert-lm baseUrl is set (PC path)', () => {
    const runtime = new ProviderRuntime(emptyEnv);
    const litert = runtime.status().providers.find((p) => p.id === 'litert');
    expect(litert?.available).toBe(true);
    expect(litert?.configured).toBe(true);
  });
});
