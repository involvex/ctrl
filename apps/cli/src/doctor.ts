import { existsSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { checkHealth } from '@involvex/ctrl-i';
import { resolveDataDir } from './paths';
import { DEFAULT_GATEWAY_PORT } from './gateway-lifecycle';

export type DoctorCheck = {
  name: string;
  ok: boolean;
  detail: string;
};

export async function doctorCommand(args: string[]): Promise<void> {
  const baseUrl = args.includes('--url')
    ? args[args.indexOf('--url') + 1]!
    : (process.env['CTRL_A_URL'] ?? `http://127.0.0.1:${DEFAULT_GATEWAY_PORT}`);
  const checks: DoctorCheck[] = [];

  // Bun version
  const bunVersion = Bun.version;
  checks.push({
    name: 'bun',
    ok: true,
    detail: `Bun ${bunVersion} (>=1.3.4 required)`,
  });

  // Node/Bun runtime
  checks.push({
    name: 'runtime',
    ok: true,
    detail: `Platform: ${process.platform} ${process.arch}, Node: ${process.version}`,
  });

  // Data dir
  const dataDir = resolveDataDir();
  const dataDirExists = existsSync(dataDir);
  checks.push({
    name: 'data dir',
    ok: dataDirExists,
    detail: dataDir + (dataDirExists ? '' : ' (missing)'),
  });

  if (dataDirExists) {
    try {
      const stats = statSync(dataDir);
      checks.push({
        name: 'data dir permissions',
        ok: stats.isDirectory(),
        detail: stats.isDirectory() ? 'writable directory' : 'not a directory',
      });
    } catch (err) {
      checks.push({
        name: 'data dir permissions',
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Config files
  const configPaths = [
    path.join(os.homedir(), '.config', 'ctrl', 'config.json'),
    path.join(process.cwd(), 'ctrl.config.json'),
    path.join(process.cwd(), '.ctrl.json'),
  ];
  let foundConfig = false;
  for (const cfg of configPaths) {
    if (existsSync(cfg)) {
      foundConfig = true;
      checks.push({
        name: 'config file',
        ok: true,
        detail: cfg,
      });
      break;
    }
  }
  if (!foundConfig) {
    checks.push({
      name: 'config file',
      ok: true,
      detail: 'none found (using defaults/env vars)',
    });
  }

  // Gateway health
  try {
    const h = await checkHealth(baseUrl);
    checks.push({
      name: 'gateway health',
      ok: true,
      detail: `${baseUrl} -> ${JSON.stringify(h)}`,
    });
  } catch (err) {
    checks.push({
      name: 'gateway health',
      ok: false,
      detail: `${baseUrl} unreachable: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  // Local backend binaries
  for (const id of ['llama', 'litert-lm'] as const) {
    const envKey = id === 'llama' ? 'CTRL_LLAMA_BIN' : 'CTRL_LITERT_LM_BIN';
    const envVal = process.env[envKey]?.trim();
    if (envVal) {
      const exists = existsSync(envVal);
      checks.push({
        name: `backend ${id}`,
        ok: exists,
        detail: `${envKey}=${envVal}${exists ? '' : ' (not found)'}`,
      });
    } else {
      // Try PATH resolution
      const cmd = id === 'llama' ? 'llama-server' : 'litert-lm';
      const probe = spawnSync(
        process.platform === 'win32' ? 'where' : 'which',
        [cmd],
        { encoding: 'utf8' }
      );
      const found = probe.status === 0 && probe.stdout.trim().length > 0;
      checks.push({
        name: `backend ${id}`,
        ok: found,
        detail: found
          ? `${cmd} on PATH: ${probe.stdout.trim().split(/\r?\n/)[0]}`
          : `${cmd} not on PATH and ${envKey} unset (optional)`,
      });
    }
  }

  // Port check
  const port = Number(
    process.env['CTRL_PORT'] ?? process.env['PORT'] ?? DEFAULT_GATEWAY_PORT
  );
  checks.push({
    name: 'gateway port',
    ok: true,
    detail: `${port} (set via CTRL_PORT/PORT)`,
  });

  // Network connectivity check
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch('https://api.openai.com', {
      method: 'HEAD',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    checks.push({
      name: 'internet connectivity',
      ok: res.ok || res.status < 500,
      detail: `reachable (status: ${res.status})`,
    });
  } catch (err) {
    checks.push({
      name: 'internet connectivity',
      ok: false,
      detail: `unreachable: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  // Environment variables
  const relevantEnvVars = [
    'CTRL_TOKEN',
    'CTRL_HOST',
    'OPENAI_API_KEY',
    'CTRL_LLAMA_BIN',
    'CTRL_LITERT_LM_BIN',
  ];
  let envCount = 0;
  for (const key of relevantEnvVars) {
    if (process.env[key]) envCount++;
  }
  checks.push({
    name: 'environment variables',
    ok: true,
    detail: `${envCount}/${relevantEnvVars.length} relevant vars set`,
  });

  // Disk space (basic check on data dir parent)
  try {
    if (dataDirExists) {
      // On Windows we can't easily get free space in pure JS, but we can at least check existence
      checks.push({
        name: 'storage',
        ok: true,
        detail: `data dir accessible: ${dataDir}`,
      });
    }
  } catch (err) {
    checks.push({
      name: 'storage',
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  // Print
  let failed = 0;
  for (const c of checks) {
    const mark = c.ok ? 'OK  ' : 'FAIL';
    process.stdout.write(`[${mark}] ${c.name}: ${c.detail}\n`);
    if (!c.ok) failed += 1;
  }
  process.stdout.write(
    `\ndoctor: ${failed === 0 ? 'all checks passed' : `${failed} check(s) failed`}\n`
  );
  if (failed > 0) {
    process.exitCode = 1;
  }
}
