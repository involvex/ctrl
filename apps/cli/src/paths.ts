import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Monorepo root (`involvex-ctrl/`). */
export function resolveRepoRoot(): string {
  const fromEnv = process.env['CTRL_REPO_ROOT']?.trim();
  if (fromEnv && existsSync(path.join(fromEnv, 'package.json'))) {
    return path.resolve(fromEnv);
  }
  // apps/cli/src → repo root
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
}

export function resolveDataDir(repoRoot = resolveRepoRoot()): string {
  const fromEnv = process.env['CTRL_DATA_DIR']?.trim();
  if (fromEnv) {
    return path.resolve(fromEnv);
  }
  return path.join(repoRoot, 'data');
}

export function gatewayPidPath(dataDir = resolveDataDir()): string {
  return path.join(dataDir, 'ctrl-a.pid');
}

export function gatewayMetaPath(dataDir = resolveDataDir()): string {
  return path.join(dataDir, 'ctrl-a.gateway.json');
}

export function gatewayLogPath(dataDir = resolveDataDir()): string {
  return path.join(dataDir, 'gateway.log');
}

export function gatewayServerEntry(repoRoot = resolveRepoRoot()): string {
  return path.join(repoRoot, 'packages', 'ctrl-a', 'src', 'server.ts');
}
