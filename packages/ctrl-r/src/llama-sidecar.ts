import { spawn, type ChildProcess } from 'node:child_process';

export type LlamaSidecarStatus =
  | { state: 'stopped' }
  | { state: 'starting' }
  | { state: 'running'; baseUrl: string; pid: number }
  | { state: 'failed'; error: string };

export type LlamaSidecarConfig = {
  /** Path to llama-server (or compatible) binary. */
  bin: string;
  /** Extra CLI args (model path, ctx size, etc.). */
  args?: string[];
  host?: string;
  port?: number;
};

const HEALTH_TIMEOUT_MS = 30_000;
const HEALTH_POLL_MS = 250;

/**
 * Manages a local OpenAI-compatible llama-server process (Phase 3).
 * Plan places sidecar ownership in ctrl-r RuntimeManager, not Electron.
 */
export class LlamaSidecar {
  private child: ChildProcess | null = null;
  private status: LlamaSidecarStatus = { state: 'stopped' };
  private readonly host: string;
  private readonly port: number;

  constructor(private readonly config: LlamaSidecarConfig) {
    this.host = config.host ?? '127.0.0.1';
    this.port = config.port ?? 8080;
  }

  getStatus(): LlamaSidecarStatus {
    return this.status;
  }

  getBaseUrl(): string {
    return `http://${this.host}:${this.port}/v1`;
  }

  async start(): Promise<{ baseUrl: string }> {
    if (this.status.state === 'running') {
      return { baseUrl: this.getBaseUrl() };
    }
    this.status = { state: 'starting' };

    const args = [
      ...(this.config.args ?? []),
      '--host',
      this.host,
      '--port',
      String(this.port),
    ];

    const child = spawn(this.config.bin, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    this.child = child;

    child.stderr?.on('data', (buf: Buffer) => {
      process.stderr.write(`[llama-server] ${buf.toString()}`);
    });
    child.stdout?.on('data', (buf: Buffer) => {
      process.stderr.write(`[llama-server] ${buf.toString()}`);
    });

    child.on('exit', (code, signal) => {
      if (this.child !== child) {
        return;
      }
      this.child = null;
      this.status = {
        state: 'failed',
        error: `exited code=${String(code)} signal=${String(signal)}`,
      };
    });

    const baseUrl = this.getBaseUrl();
    try {
      await waitForOpenAi(baseUrl);
    } catch (err) {
      child.kill('SIGTERM');
      this.child = null;
      const message = err instanceof Error ? err.message : String(err);
      this.status = { state: 'failed', error: message };
      throw err;
    }

    if (!child.pid) {
      this.status = { state: 'failed', error: 'no pid' };
      throw new Error('llama-server has no pid');
    }

    this.status = { state: 'running', baseUrl, pid: child.pid };
    return { baseUrl };
  }

  async stop(): Promise<void> {
    const child = this.child;
    this.child = null;
    if (!child || child.killed) {
      this.status = { state: 'stopped' };
      return;
    }
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        resolve();
      }, 5_000);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
      child.kill('SIGTERM');
    });
    this.status = { state: 'stopped' };
  }
}

async function waitForOpenAi(baseUrl: string): Promise<void> {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  const modelsUrl = `${baseUrl.replace(/\/$/, '')}/models`;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(modelsUrl);
      if (res.ok) {
        return;
      }
    } catch {
      // retry
    }
    await Bun.sleep(HEALTH_POLL_MS);
  }
  throw new Error(`llama-server health timed out: ${modelsUrl}`);
}

/** Create a sidecar from env, or null when not configured. */
export function createLlamaSidecarFromEnv(
  env: NodeJS.ProcessEnv = process.env
): LlamaSidecar | null {
  const bin = env['CTRL_LLAMA_BIN']?.trim();
  if (!bin) {
    return null;
  }
  const extra = env['CTRL_LLAMA_ARGS']?.trim();
  const args = extra ? extra.split(/\s+/).filter(Boolean) : [];
  const port = Number(env['CTRL_LLAMA_PORT'] ?? 8080);
  return new LlamaSidecar({
    bin,
    args,
    host: env['CTRL_LLAMA_HOST'] ?? '127.0.0.1',
    port: Number.isFinite(port) && port > 0 ? port : 8080,
  });
}
