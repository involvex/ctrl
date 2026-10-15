#!/usr/bin/env bun
/**
 * Free the default ctrl-a listen port (7331) or PORT from the environment.
 * Useful when a leftover `bun run src/server.ts` / desktop gateway still holds it.
 */
import { spawnSync } from 'node:child_process';

const port = Number(process.env['PORT'] ?? 7331);

function pidsOnPortWindows(p: number): number[] {
  const out = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      `(Get-NetTCPConnection -LocalPort ${p} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)`,
    ],
    { encoding: 'utf8' }
  );
  if (out.status !== 0 || !out.stdout.trim()) {
    return [];
  }
  return out.stdout
    .split(/\r?\n/)
    .map((line) => Number(line.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}

function pidsOnPortUnix(p: number): number[] {
  const out = spawnSync('lsof', ['-t', `-iTCP:${p}`, '-sTCP:LISTEN'], {
    encoding: 'utf8',
  });
  if (out.status !== 0 || !out.stdout.trim()) {
    return [];
  }
  return out.stdout
    .split(/\r?\n/)
    .map((line) => Number(line.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}

const pids =
  process.platform === 'win32' ? pidsOnPortWindows(port) : pidsOnPortUnix(port);

if (pids.length === 0) {
  process.stdout.write(`[gateway:free] nothing listening on ${port}\n`);
  process.exit(0);
}

for (const pid of pids) {
  try {
    process.kill(pid, 'SIGTERM');
    process.stdout.write(`[gateway:free] stopped pid ${pid} on port ${port}\n`);
  } catch (err) {
    process.stderr.write(
      `[gateway:free] failed to stop ${pid}: ${err instanceof Error ? err.message : String(err)}\n`
    );
  }
}
