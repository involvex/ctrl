#!/usr/bin/env bun
/**
 * Start ctrl-a on an ephemeral port, run contract tests, then stop the gateway.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..'
);
const serverEntry = path.join(root, 'packages/ctrl-a/src/server.ts');
const port = 40_000 + Math.floor(Math.random() * 20_000);
const baseUrl = `http://127.0.0.1:${port}`;
const tmpDb = path.join(root, 'data', `contract-${port}.db`);

async function waitForHealth(url: string, ms = 15_000): Promise<void> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/healthz`);
      if (res.ok) {
        return;
      }
    } catch {
      // retry
    }
    await Bun.sleep(100);
  }
  throw new Error(`gateway did not become healthy at ${url}`);
}

process.stderr.write(`[ctrl-t] starting gateway on ${baseUrl}\n`);

const child = spawn('bun', ['run', serverEntry], {
  cwd: root,
  env: {
    ...process.env,
    HOST: '127.0.0.1',
    PORT: String(port),
    CTRL_DB_PATH: tmpDb,
    // Real MCP stdio JSON-RPC for contract coverage
    CTRL_MCP_STDIO: '1',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
  shell: true,
});

child.stderr?.on('data', (buf: Buffer) => {
  process.stderr.write(buf);
});

async function runTests(): Promise<number> {
  await waitForHealth(baseUrl);
  process.stderr.write(`[ctrl-t] running contract tests against ${baseUrl}\n`);

  const test = spawn('bun', ['test', './src'], {
    cwd: path.join(root, 'packages/ctrl-t'),
    env: {
      ...process.env,
      BASE_URL: baseUrl,
    },
    stdio: 'inherit',
    shell: true,
  });

  return await new Promise<number>((resolve, reject) => {
    test.on('error', reject);
    test.on('exit', (code) => {
      resolve(code ?? 1);
    });
  });
}

async function stopGateway(): Promise<void> {
  child.kill('SIGTERM');
  await new Promise<void>((resolve) => {
    const t = setTimeout(() => {
      child.kill('SIGKILL');
      resolve();
    }, 3000);
    child.once('exit', () => {
      clearTimeout(t);
      resolve();
    });
  });
}

const exitCode = await runTests().catch(() => 1);
await stopGateway();
process.exit(exitCode);
