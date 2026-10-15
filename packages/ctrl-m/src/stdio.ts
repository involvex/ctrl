import { spawn, type ChildProcess } from 'node:child_process';

export type JsonRpcRequest = {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: unknown;
};

export type JsonRpcNotification = {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
};

export type JsonRpcResponse = {
  jsonrpc: '2.0';
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

type Pending = {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
};

/**
 * Newline-delimited JSON-RPC over a child process stdio (MCP transport).
 */
export class JsonRpcStdioTransport {
  private readonly child: ChildProcess;
  private readonly pending = new Map<string, Pending>();
  private buffer = '';
  private nextId = 1;
  private closed = false;

  constructor(
    command: string,
    args: string[] = [],
    env?: Record<string, string>
  ) {
    this.child = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
      shell: false,
    });

    this.child.stdout?.setEncoding('utf8');
    this.child.stdout?.on('data', (chunk: string) => {
      this.onStdout(chunk);
    });
    this.child.stderr?.setEncoding('utf8');
    this.child.stderr?.on('data', (chunk: string) => {
      process.stderr.write(`[mcp:${command}] ${chunk}`);
    });
    this.child.on('error', (err) => {
      this.failAll(err);
    });
    this.child.on('exit', (code, signal) => {
      this.closed = true;
      this.failAll(
        new Error(
          `MCP process exited (code=${String(code)} signal=${String(signal)})`
        )
      );
    });
  }

  get pid(): number | undefined {
    return this.child.pid;
  }

  async request(method: string, params?: unknown): Promise<unknown> {
    if (this.closed) {
      throw new Error('MCP transport closed');
    }
    const id = this.nextId++;
    const payload: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      ...(params === undefined ? {} : { params }),
    };
    const key = String(id);
    const result = new Promise<unknown>((resolve, reject) => {
      this.pending.set(key, { resolve, reject });
    });
    this.write(payload);
    return await result;
  }

  notify(method: string, params?: unknown): void {
    if (this.closed) {
      return;
    }
    const payload: JsonRpcNotification = {
      jsonrpc: '2.0',
      method,
      ...(params === undefined ? {} : { params }),
    };
    this.write(payload);
  }

  async close(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;
    try {
      this.child.stdin?.end();
    } catch {
      // ignore
    }
    const exited = new Promise<void>((resolve) => {
      this.child.once('exit', () => {
        resolve();
      });
    });
    this.child.kill('SIGTERM');
    await Promise.race([exited, Bun.sleep(2000)]);
    if (!this.child.killed) {
      this.child.kill('SIGKILL');
    }
  }

  private write(message: JsonRpcRequest | JsonRpcNotification): void {
    this.child.stdin?.write(`${JSON.stringify(message)}\n`);
  }

  private onStdout(chunk: string): void {
    this.buffer += chunk;
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        continue;
      }
      if (!parsed || typeof parsed !== 'object') {
        continue;
      }
      if (!('id' in parsed) || parsed.id === null || parsed.id === undefined) {
        continue;
      }
      const id = parsed.id;
      if (typeof id !== 'string' && typeof id !== 'number') {
        continue;
      }
      const key = String(id);
      const waiter = this.pending.get(key);
      if (!waiter) {
        continue;
      }
      this.pending.delete(key);
      if (
        'error' in parsed &&
        parsed.error &&
        typeof parsed.error === 'object' &&
        'code' in parsed.error &&
        'message' in parsed.error
      ) {
        const code = parsed.error.code;
        const message = parsed.error.message;
        waiter.reject(
          new Error(
            `JSON-RPC ${typeof code === 'number' ? String(code) : '?'}: ${typeof message === 'string' ? message : 'error'}`
          )
        );
      } else {
        waiter.resolve('result' in parsed ? parsed.result : undefined);
      }
    }
  }

  private failAll(err: Error): void {
    for (const [, waiter] of this.pending) {
      waiter.reject(err);
    }
    this.pending.clear();
  }
}
