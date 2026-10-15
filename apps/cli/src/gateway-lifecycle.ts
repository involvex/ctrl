import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { checkHealth } from '@involvex/ctrl-i';
import {
  gatewayLogPath,
  gatewayMetaPath,
  gatewayPidPath,
  gatewayServerEntry,
  resolveDataDir,
  resolveRepoRoot,
} from './paths';

export const DEFAULT_GATEWAY_PORT = 7331;

export type GatewayMeta = {
  pid: number;
  port: number;
  host: string;
  url: string;
  startedAt: number;
};

function readPid(pidPath: string): number | null {
  if (!existsSync(pidPath)) {
    return null;
  }
  const raw = readFileSync(pidPath, 'utf8').trim();
  const pid = Number(raw);
  return Number.isFinite(pid) && pid > 0 ? pid : null;
}

function readMeta(metaPath: string): GatewayMeta | null {
  if (!existsSync(metaPath)) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(readFileSync(metaPath, 'utf8'));
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    const rec = parsed as Record<string, unknown>;
    if (
      typeof rec['pid'] !== 'number' ||
      typeof rec['port'] !== 'number' ||
      typeof rec['host'] !== 'string' ||
      typeof rec['url'] !== 'string'
    ) {
      return null;
    }
    return {
      pid: rec['pid'],
      port: rec['port'],
      host: rec['host'],
      url: rec['url'],
      startedAt:
        typeof rec['startedAt'] === 'number' ? rec['startedAt'] : Date.now(),
    };
  } catch {
    return null;
  }
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function pidsOnPort(port: number): number[] {
  if (process.platform === 'win32') {
    const out = spawnSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        `(Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)`,
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
  const out = spawnSync('lsof', ['-t', `-iTCP:${port}`, '-sTCP:LISTEN'], {
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

async function waitForHealth(
  url: string,
  timeoutMs = 15_000
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await checkHealth(url);
      return true;
    } catch {
      await Bun.sleep(200);
    }
  }
  return false;
}

function clearState(dataDir: string): void {
  for (const p of [gatewayPidPath(dataDir), gatewayMetaPath(dataDir)]) {
    if (existsSync(p)) {
      unlinkSync(p);
    }
  }
}

export type LifecycleOpts = {
  port?: number;
  host?: string;
};

export async function gatewayStatus(opts: LifecycleOpts = {}): Promise<{
  state: 'stopped' | 'running' | 'stale';
  meta: GatewayMeta | null;
  health: boolean;
  message: string;
}> {
  const dataDir = resolveDataDir();
  const port = opts.port ?? DEFAULT_GATEWAY_PORT;
  const meta = readMeta(gatewayMetaPath(dataDir));
  const pid = meta?.pid ?? readPid(gatewayPidPath(dataDir));
  const url =
    meta?.url ??
    `http://${opts.host ?? meta?.host ?? '127.0.0.1'}:${meta?.port ?? port}`;

  let health = false;
  try {
    await checkHealth(url);
    health = true;
  } catch {
    health = false;
  }

  if (pid && isPidAlive(pid) && health) {
    return {
      state: 'running',
      meta: meta ?? {
        pid,
        port,
        host: opts.host ?? '0.0.0.0',
        url,
        startedAt: Date.now(),
      },
      health: true,
      message: `running pid ${pid} · ${url}`,
    };
  }

  if (health) {
    return {
      state: 'running',
      meta,
      health: true,
      message: `reachable at ${url} (no managed pid)`,
    };
  }

  if (pid && isPidAlive(pid) && !health) {
    return {
      state: 'stale',
      meta,
      health: false,
      message: `pid ${pid} alive but ${url}/healthz failed`,
    };
  }

  return {
    state: 'stopped',
    meta: null,
    health: false,
    message: `stopped · ${url}`,
  };
}

export async function gatewayStart(
  opts: LifecycleOpts = {}
): Promise<{ meta: GatewayMeta; alreadyRunning: boolean }> {
  const repoRoot = resolveRepoRoot();
  const dataDir = resolveDataDir(repoRoot);
  mkdirSync(dataDir, { recursive: true });

  const port = opts.port ?? Number(process.env['PORT'] ?? DEFAULT_GATEWAY_PORT);
  const host = opts.host ?? process.env['CTRL_A_HOST'] ?? '0.0.0.0';
  const loopbackUrl = `http://127.0.0.1:${port}`;

  const current = await gatewayStatus({ port, host });
  if (current.state === 'running' && current.health) {
    const meta =
      current.meta ??
      ({
        pid: 0,
        port,
        host,
        url: loopbackUrl,
        startedAt: Date.now(),
      } satisfies GatewayMeta);
    return { meta, alreadyRunning: true };
  }

  const entry = gatewayServerEntry(repoRoot);
  if (!existsSync(entry)) {
    throw new Error(`gateway entry missing: ${entry}`);
  }

  const logPath = gatewayLogPath(dataDir);
  const logFd = openSync(logPath, 'a');
  const child = spawn(process.execPath, ['run', entry], {
    cwd: repoRoot,
    detached: true,
    stdio: ['ignore', logFd, logFd],
    env: {
      ...process.env,
      CTRL_A_HOST: host,
      HOST: host,
      PORT: String(port),
      CTRL_DATA_DIR: dataDir,
    },
    windowsHide: true,
  });

  if (!child.pid) {
    throw new Error('failed to spawn gateway (no pid)');
  }

  child.unref();

  const meta: GatewayMeta = {
    pid: child.pid,
    port,
    host,
    url: loopbackUrl,
    startedAt: Date.now(),
  };
  writeFileSync(gatewayPidPath(dataDir), `${meta.pid}\n`, 'utf8');
  writeFileSync(gatewayMetaPath(dataDir), `${JSON.stringify(meta, null, 2)}\n`);

  const ok = await waitForHealth(loopbackUrl);
  if (!ok) {
    throw new Error(
      `gateway started (pid ${meta.pid}) but health timed out — see ${logPath}`
    );
  }
  return { meta, alreadyRunning: false };
}

export async function gatewayStop(
  opts: LifecycleOpts = {}
): Promise<{ stopped: number[]; message: string }> {
  const dataDir = resolveDataDir();
  const port = opts.port ?? Number(process.env['PORT'] ?? DEFAULT_GATEWAY_PORT);
  const meta = readMeta(gatewayMetaPath(dataDir));
  const managedPid = meta?.pid ?? readPid(gatewayPidPath(dataDir));
  const stopped = new Set<number>();

  const candidates = new Set<number>();
  if (managedPid) {
    candidates.add(managedPid);
  }
  for (const pid of pidsOnPort(meta?.port ?? port)) {
    candidates.add(pid);
  }

  for (const pid of candidates) {
    if (!isPidAlive(pid)) {
      continue;
    }
    try {
      process.kill(pid, 'SIGTERM');
      stopped.add(pid);
    } catch {
      try {
        if (process.platform === 'win32') {
          spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
            stdio: 'ignore',
          });
          stopped.add(pid);
        } else {
          process.kill(pid, 'SIGKILL');
          stopped.add(pid);
        }
      } catch {
        // ignore
      }
    }
  }

  // Brief wait then force remaining listeners on the port.
  await Bun.sleep(400);
  for (const pid of pidsOnPort(meta?.port ?? port)) {
    if (!isPidAlive(pid)) {
      continue;
    }
    try {
      if (process.platform === 'win32') {
        spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
          stdio: 'ignore',
        });
      } else {
        process.kill(pid, 'SIGKILL');
      }
      stopped.add(pid);
    } catch {
      // ignore
    }
  }

  clearState(dataDir);
  const list = [...stopped];
  return {
    stopped: list,
    message:
      list.length > 0
        ? `stopped ${list.map((p) => `pid ${p}`).join(', ')}`
        : 'nothing to stop',
  };
}
