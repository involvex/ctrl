#!/usr/bin/env bun
/**
 * Start ctrl-a on an ephemeral port, run contract tests, then stop the gateway.
 * Second pass: tokened gateway for bearer-auth contracts.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..'
);
const serverEntry = path.join(root, 'packages/ctrl-a/src/server.ts');
const ctrlT = path.join(root, 'packages/ctrl-t');

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

function startGateway(opts: {
  port: number;
  dataDir: string;
  dbPath: string;
  token?: string;
}): ReturnType<typeof spawn> {
  return spawn('bun', ['run', serverEntry], {
    cwd: root,
    env: {
      ...process.env,
      CTRL_A_HOST: '127.0.0.1',
      HOST: '127.0.0.1',
      PORT: String(opts.port),
      CTRL_DATA_DIR: opts.dataDir,
      CTRL_DB_PATH: opts.dbPath,
      CTRL_PROVIDER: 'mock',
      CTRL_MCP_STDIO: '1',
      ...(opts.token ? { CTRL_GATEWAY_TOKEN: opts.token } : {}),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
  });
}

async function stopChild(child: ReturnType<typeof spawn>): Promise<void> {
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

async function runBunTest(
  args: string[],
  env: Record<string, string>
): Promise<number> {
  const test = spawn('bun', ['test', ...args], {
    cwd: ctrlT,
    env: {
      ...process.env,
      ...env,
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

const openPort = 40_000 + Math.floor(Math.random() * 20_000);
const openBase = `http://127.0.0.1:${openPort}`;
const openData = path.join(root, 'data', `contract-${openPort}`);
const openDb = path.join(openData, 'app.db');

process.stderr.write(`[ctrl-t] starting gateway on ${openBase}\n`);
const openChild = startGateway({
  port: openPort,
  dataDir: openData,
  dbPath: openDb,
});
openChild.stderr?.on('data', (buf: Buffer) => {
  process.stderr.write(buf);
});

let exitCode: number;
try {
  await waitForHealth(openBase);
  process.stderr.write(
    `[ctrl-t] running open-mode contracts against ${openBase}\n`
  );
  exitCode = await runBunTest(['./src'], { BASE_URL: openBase });
} catch {
  exitCode = 1;
}
await stopChild(openChild);

if (exitCode === 0) {
  const token = `contract-token-${openPort}`;
  const tokenPort = openPort + 1;
  const tokenBase = `http://127.0.0.1:${tokenPort}`;
  const tokenData = path.join(root, 'data', `contract-token-${tokenPort}`);
  const tokenDb = path.join(tokenData, 'app.db');

  process.stderr.write(`[ctrl-t] starting tokened gateway on ${tokenBase}\n`);
  const tokenChild = startGateway({
    port: tokenPort,
    dataDir: tokenData,
    dbPath: tokenDb,
    token,
  });
  tokenChild.stderr?.on('data', (buf: Buffer) => {
    process.stderr.write(buf);
  });

  try {
    await waitForHealth(tokenBase);
    process.stderr.write(
      `[ctrl-t] running bearer contracts against ${tokenBase}\n`
    );
    exitCode = await runBunTest(['./src/auth-bearer.tokened.test.ts'], {
      BASE_URL: tokenBase,
      CTRL_CONTRACT_TOKENED: '1',
      CTRL_GATEWAY_TOKEN: token,
    });
  } catch {
    exitCode = 1;
  }
  await stopChild(tokenChild);
}

process.exit(exitCode);
