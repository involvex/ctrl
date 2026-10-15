import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { gatewayServerEntry, resolveDataDir, resolveRepoRoot } from './paths';

describe('cli paths', () => {
  test('resolves monorepo root with package.json', () => {
    const root = resolveRepoRoot();
    expect(existsSync(path.join(root, 'package.json'))).toBe(true);
    expect(existsSync(gatewayServerEntry(root))).toBe(true);
  });

  test('data dir defaults under repo', () => {
    const root = resolveRepoRoot();
    expect(resolveDataDir(root)).toBe(path.join(root, 'data'));
  });
});
