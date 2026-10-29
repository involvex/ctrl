import { spawn, type ChildProcess } from 'node:child_process';

export type LocalOpenAiSidecarStatus =
  | { state: 'stopped' }
  | { state: 'starting' }
  | { state: 'running'; baseUrl: string; pid: number }
  | { state: 'failed'; error: string };

export type LocalOpenAiSidecarConfig = {
  /** Display name for logs (llama-server, litert-lm, …). */
  name: string;
  /** Path to the binary. */
  bin: string;
  /** Extra CLI args (model path, etc.). */
  args?: string[];
  host?: string;
  port?: number;
  /**
   * How to pass host/port. llama-server uses `--host`/`--port`;
   * litert-lm commonly uses `--host`/`--port` as well.
   */
  portArgs?: 'llama' | 'plain';
};

const HEALTH_TIMEOUT_MS = 30_000;
const HEALTH_POLL_MS = 250;

/**
 * Manages a local OpenAI-compatible HTTP server process
 * (llama-server, litert-lm, …).
 */
export class LocalOpenAiSidecar {
  private child: ChildProcess | null = null;
  private status: LocalOpenAiSidecarStatus = { state: 'stopped' };
  private readonly host: string;
  private readonly port: number;
  private readonly name: string;

  constructor(private readonly config: LocalOpenAiSidecarConfig) {
    this.name = config.name;
    this.host = config.host ?? '127.0.0.1';
    this.port = config.port ?? 8080;
  }

  getStatus(): LocalOpenAiSidecarStatus {
    return this.status;
  }

  getBaseUrl(): string {
    return `http://${this.host}:${this.port}/v1`;
  }

  getPort(): number {
    return this.port;
  }

  getName(): string {
    return this.name;
  }

  async start(): Promise<{ baseUrl: string }> {
    if (this.status.state === 'running') {
      return { baseUrl: this.getBaseUrl() };
    }
    this.status = { state: 'starting' };

    const style = this.config.portArgs ?? 'llama';
    const args =
      style === 'plain'
        ? [
            ...(this.config.args ?? []),
            '--host',
            this.host,
            '--port',
            String(this.port),
          ]
        : [
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
      process.stderr.write(`[${this.name}] ${buf.toString()}`);
    });
    child.stdout?.on('data', (buf: Buffer) => {
      process.stderr.write(`[${this.name}] ${buf.toString()}`);
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
      await waitForOpenAi(baseUrl, this.name);
    } catch (err) {
      child.kill('SIGTERM');
      this.child = null;
      const message = err instanceof Error ? err.message : String(err);
      this.status = { state: 'failed', error: message };
      throw err;
    }

    if (!child.pid) {
      this.status = { state: 'failed', error: 'no pid' };
      throw new Error(`${this.name} has no pid`);
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

export async function waitForOpenAi(
  baseUrl: string,
  name = 'openai-sidecar'
): Promise<void> {
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
  throw new Error(`${name} health timed out: ${modelsUrl}`);
}

/** Probe an already-running OpenAI-compatible /models endpoint. */
export async function probeOpenAiModels(
  baseUrl: string,
  timeoutMs = 2_000
): Promise<{ ok: true; models: string[] } | { ok: false; error: string }> {
  const modelsUrl = `${baseUrl.replace(/\/$/, '')}/models`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(modelsUrl, { signal: ctrl.signal });
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }
    const body = (await res.json()) as {
      data?: Array<{ id?: string }>;
    };
    const models = (body.data ?? [])
      .map((row) => row.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    return { ok: true, models };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}
