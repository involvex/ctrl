import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ProviderRuntime } from './runtime';
import { loadPersistedProvider, providerPersistPath } from './persist';

describe('provider persistence', () => {
  test('PATCH selection survives reload from provider.json', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'ctrl-r-persist-'));
    const persistPath = providerPersistPath(dir);
    const env = { ...process.env, CTRL_PROVIDER: 'mock' };
    const first = new ProviderRuntime(env, { persistPath });
    first.update({ active: 'llama', model: 'local-test' });
    const onDisk = loadPersistedProvider(persistPath);
    expect(onDisk?.active).toBe('llama');
    expect(onDisk?.model).toBe('local-test');
    expect(JSON.parse(readFileSync(persistPath, 'utf8')).version).toBe(1);

    const second = new ProviderRuntime(env, { persistPath });
    expect(second.getConfig().active).toBe('llama');
    expect(second.getConfig().model).toBe('local-test');
  });
});
