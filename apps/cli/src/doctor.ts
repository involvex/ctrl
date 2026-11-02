import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
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
    detail: `Bun ${bunVersion}`,
  });

  // Data dir
  const dataDir = resolveDataDir();
  checks.push({
    name: 'data dir',
    ok: existsSync(dataDir),
    detail: dataDir + (existsSync(dataDir) ? '' : ' (missing)'),
  });

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
      checks.push({
        name: `backend ${id}`,
        ok: existsSync(envVal),
        detail: `${envKey}=${envVal}${existsSync(envVal) ? '' : ' (not found)'}`,
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
          : `${cmd} not on PATH and ${envKey} unset`,
      });
    }
  }

  // Port check (only if gateway not reachable)
  const port = Number(process.env['PORT'] ?? DEFAULT_GATEWAY_PORT);
  checks.push({
    name: 'port',
    ok: true,
    detail: `default port ${port}`,
  });

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
