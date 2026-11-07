import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

export type GatewayStatus =
  | { state: 'stopped' }
  | { state: 'starting'; attempt: number }
  | { state: 'running'; url: string; pid: number }
  | { state: 'restarting'; attempt: number; delayMs: number }
  | { state: 'failed'; error: string };

export type GatewayStatusListener = (status: GatewayStatus) => void;

export type GatewayManagerOptions = {
  repoRoot: string;
  packaged: boolean;
  resourcesPath: string;
  /** Extra env vars passed to the gateway child (e.g. CTRL_GATEWAY_TOKEN). */
  envExtra?: Record<string, string>;
};

const HEALTH_TIMEOUT_MS = 15_000;
const HEALTH_POLL_MS = 200;
const STOP_TIMEOUT_MS = 5_000;
const MAX_BACKOFF_MS = 10_000;
const MAX_START_ATTEMPTS = 5;

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => {
      resolve(false);
    });
    server.once('listening', () => {
      server.close(() => {
        resolve(true);
      });
    });
    server.listen(port, '0.0.0.0');
  });
}

/**
 * Prefer 7331 so mobile / CLI defaults match the desktop host.
 * Fall back to a high ephemeral port when 7331 is taken.
 */
async function pickPort(): Promise<number> {
  const fromEnv = Number(process.env['CTRL_A_PORT']);
  if (Number.isFinite(fromEnv) && fromEnv > 0) {
    return fromEnv;
  }
  if (await isPortFree(7331)) {
    return 7331;
  }
  return 40_000 + Math.floor(Math.random() * 20_000);
}

function gatewayBinaryName(): string {
  return process.platform === 'win32' ? 'ctrl-a.exe' : 'ctrl-a';
}

function resolveBunBin(): string {
  if (process.env['BUN_BIN']) {
    return process.env['BUN_BIN'];
  }
  const home = process.env['USERPROFILE'] ?? process.env['HOME'] ?? '';
  if (home) {
    const candidate =
      process.platform === 'win32'
        ? path.join(home, '.bun', 'bin', 'bun.exe')
        : path.join(home, '.bun', 'bin', 'bun');
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return 'bun';
}

async function waitForHealth(url: string, signal: AbortSignal): Promise<void> {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (signal.aborted) {
      throw new Error('health wait aborted');
    }
    try {
      const res = await fetch(`${url}/healthz`, { signal });
      if (res.ok) {
        return;
      }
    } catch {
      // retry until timeout
    }
    await new Promise((r) => setTimeout(r, HEALTH_POLL_MS));
  }
  throw new Error(`gateway health check timed out: ${url}/healthz`);
}

export class GatewayManager {
  private child: ChildProcess | null = null;
  private status: GatewayStatus = { state: 'stopped' };
  private readonly listeners = new Set<GatewayStatusListener>();
  private stopping = false;
  private attempt = 0;
  private port = 7331;
  private url = 'http://127.0.0.1:7331';
  private healthAbort: AbortController | null = null;
  /** True while spawnWithRetry owns the restart loop (single-flight). */
  private restartInFlight = false;
  /** When true, exit handler must not start another spawnWithRetry. */
  private intentionalKill = false;

  constructor(private readonly opts: GatewayManagerOptions) {}

  onStatus(listener: GatewayStatusListener): () => void {
    this.listeners.add(listener);
    listener(this.status);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getStatus(): GatewayStatus {
    return this.status;
  }

  getUrl(): string {
    return this.url;
  }

  private setStatus(next: GatewayStatus): void {
    this.status = next;
    for (const listener of this.listeners) {
      listener(next);
    }
  }

  async start(): Promise<string> {
    this.stopping = false;
    this.attempt = 0;
    await this.spawnWithRetry();
    return this.url;
  }

  async stop(): Promise<void> {
    this.stopping = true;
    this.intentionalKill = true;
    this.healthAbort?.abort();
    this.healthAbort = null;

    const child = this.child;
    this.child = null;
    if (!child || child.killed) {
      this.setStatus({ state: 'stopped' });
      this.intentionalKill = false;
      return;
    }

    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        resolve();
      }, STOP_TIMEOUT_MS);

      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });

      child.kill('SIGTERM');
    });

    this.setStatus({ state: 'stopped' });
    this.intentionalKill = false;
  }

  private async spawnWithRetry(): Promise<void> {
    if (this.restartInFlight) {
      return;
    }
    this.restartInFlight = true;
    try {
      while (!this.stopping) {
        this.attempt += 1;
        if (this.attempt > MAX_START_ATTEMPTS) {
          this.setStatus({
            state: 'failed',
            error: `gateway failed after ${MAX_START_ATTEMPTS} start attempts`,
          });
          return;
        }
        this.setStatus({ state: 'starting', attempt: this.attempt });

        try {
          await this.spawnOnce();
          return;
        } catch (err) {
          if (this.stopping) {
            return;
          }
          const message = err instanceof Error ? err.message : String(err);
          process.stderr.write(
            `[ctrl-desktop] gateway start failed: ${message}\n`
          );
          if (this.attempt >= MAX_START_ATTEMPTS) {
            this.setStatus({
              state: 'failed',
              error: message,
            });
            return;
          }
          const delayMs = Math.min(
            500 * 2 ** Math.min(this.attempt - 1, 4),
            MAX_BACKOFF_MS
          );
          this.setStatus({
            state: 'restarting',
            attempt: this.attempt,
            delayMs,
          });
          await new Promise((r) => setTimeout(r, delayMs));
        }
      }
    } finally {
      this.restartInFlight = false;
    }
  }

  private resolveSpawn(): { command: string; args: string[]; cwd: string } {
    if (this.opts.packaged) {
      const command = path.join(this.opts.resourcesPath, gatewayBinaryName());
      return {
        command,
        args: [],
        cwd: this.opts.resourcesPath,
      };
    }

    const entry = path.join(
      this.opts.repoRoot,
      'packages',
      'ctrl-a',
      'src',
      'server.ts'
    );
    if (!fs.existsSync(entry)) {
      throw new Error(`gateway entry not found: ${entry}`);
    }
    return {
      command: resolveBunBin(),
      args: ['run', entry],
      cwd: this.opts.repoRoot,
    };
  }

  private async spawnOnce(): Promise<void> {
    this.port = await pickPort();
    this.url = `http://127.0.0.1:${this.port}`;

    const { command, args, cwd } = this.resolveSpawn();
    process.stderr.write(
      `[ctrl-desktop] spawning gateway: ${command} ${args.join(' ')} (port ${this.port})\n`
    );

    let child: ChildProcess;
    try {
      child = spawn(command, args, {
        cwd,
        env: {
          ...process.env,
          // Phase 0/3: bind all interfaces so Expo devices on LAN can reach the gateway.
          // Set CTRL_A_LAN=0 to force loopback-only. Pairing token required when set.
          CTRL_A_HOST:
            process.env['CTRL_A_LAN'] === '0' ? '127.0.0.1' : '0.0.0.0',
          HOST: process.env['CTRL_A_LAN'] === '0' ? '127.0.0.1' : '0.0.0.0',
          PORT: String(this.port),
          ...this.opts.envExtra,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`failed to spawn gateway (${command}): ${message}`, {
        cause: err,
      });
    }

    this.child = child;
    this.intentionalKill = false;

    child.stdout?.on('data', (buf: Buffer) => {
      process.stderr.write(`[ctrl-a] ${buf.toString()}`);
    });
    child.stderr?.on('data', (buf: Buffer) => {
      process.stderr.write(`[ctrl-a] ${buf.toString()}`);
    });

    child.on('error', (err) => {
      process.stderr.write(
        `[ctrl-desktop] gateway process error: ${err.message}\n`
      );
    });

    child.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
      if (this.child !== child) {
        return;
      }
      this.child = null;
      if (this.stopping || this.intentionalKill) {
        if (this.stopping) {
          this.setStatus({ state: 'stopped' });
        }
        return;
      }
      this.setStatus({
        state: 'failed',
        error: `exited code=${code ?? 'null'} signal=${signal ?? 'null'}`,
      });
      // Only the exit handler restarts after a previously healthy process dies.
      // Health-timeout kills set intentionalKill so they do not double-start.
      void this.spawnWithRetry();
    });

    this.healthAbort = new AbortController();
    try {
      await waitForHealth(this.url, this.healthAbort.signal);
    } catch (err) {
      this.intentionalKill = true;
      if (this.child === child) {
        this.child = null;
      }
      child.kill('SIGTERM');
      throw err;
    }

    if (!child.pid) {
      throw new Error('gateway process has no pid');
    }

    this.attempt = 0;
    this.setStatus({
      state: 'running',
      url: this.url,
      pid: child.pid,
    });
  }
}
