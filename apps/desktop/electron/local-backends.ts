import { spawn, type ChildProcess, execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type LocalBackendId = 'llama' | 'litert-lm';

export type LocalBackendSnapshot = {
  id: LocalBackendId;
  port: number;
  running: boolean;
  baseUrl: string;
  modelsPreview: string[];
  binFound: boolean;
  binPath: string | null;
  installHint: string;
  error?: string;
};

type BackendDef = {
  id: LocalBackendId;
  port: number;
  binNames: string[];
  envBin: string;
  envArgs: string;
  installHint: string;
  knownDirs: string[];
};

const DEFS: BackendDef[] = [
  {
    id: 'llama',
    port: 8080,
    binNames:
      process.platform === 'win32'
        ? ['llama-server.exe', 'llama-server']
        : ['llama-server'],
    envBin: 'CTRL_LLAMA_BIN',
    envArgs: 'CTRL_LLAMA_ARGS',
    installHint:
      'Install llama.cpp llama-server and put it on PATH, or set CTRL_LLAMA_BIN.',
    knownDirs: [
      path.join(os.homedir(), 'llama.cpp'),
      path.join(os.homedir(), '.local', 'bin'),
      'C:\\llama.cpp',
    ],
  },
  {
    id: 'litert-lm',
    port: 9379,
    binNames:
      process.platform === 'win32'
        ? ['litert-lm.exe', 'litert-lm']
        : ['litert-lm'],
    envBin: 'CTRL_LITERT_LM_BIN',
    envArgs: 'CTRL_LITERT_LM_ARGS',
    installHint:
      'Install litert-lm and put it on PATH, or set CTRL_LITERT_LM_BIN.',
    knownDirs: [
      path.join(os.homedir(), 'litert-lm'),
      path.join(os.homedir(), '.local', 'bin'),
      'C:\\litert-lm',
    ],
  },
];

async function which(bin: string): Promise<string | null> {
  try {
    if (process.platform === 'win32') {
      const { stdout } = await execFileAsync('where', [bin], {
        windowsHide: true,
      });
      const first = stdout
        .split(/\r?\n/)
        .map((l) => l.trim())
        .find((l) => l.length > 0);
      return first ?? null;
    }
    const { stdout } = await execFileAsync('which', [bin]);
    const first = stdout.trim().split(/\r?\n/)[0];
    return first || null;
  } catch {
    return null;
  }
}

async function resolveBin(
  def: BackendDef,
  overrides: Record<string, string>
): Promise<string | null> {
  const fromOverride = overrides[def.id]?.trim();
  if (fromOverride && fs.existsSync(fromOverride)) {
    return fromOverride;
  }
  const fromEnv = process.env[def.envBin]?.trim();
  if (fromEnv && fs.existsSync(fromEnv)) {
    return fromEnv;
  }
  for (const name of def.binNames) {
    const found = await which(name);
    if (found) {
      return found;
    }
  }
  for (const dir of def.knownDirs) {
    for (const name of def.binNames) {
      const candidate = path.join(dir, name);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

async function probeModels(
  baseUrl: string
): Promise<{ ok: boolean; models: string[] }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 1500);
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/models`, {
      signal: ctrl.signal,
    });
    if (!res.ok) {
      return { ok: false, models: [] };
    }
    const body = (await res.json()) as { data?: Array<{ id?: string }> };
    const models = (body.data ?? [])
      .map((r) => r.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    return { ok: true, models };
  } catch {
    return { ok: false, models: [] };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Detects and optionally launches local OpenAI-compatible backends
 * (llama-server :8080, litert-lm :9379) from the desktop host process.
 */
export class LocalBackendsManager {
  private readonly children = new Map<LocalBackendId, ChildProcess>();
  private readonly binOverrides: Record<string, string> = {};

  setBinPath(id: LocalBackendId, binPath: string): void {
    this.binOverrides[id] = binPath;
  }

  getBinPath(id: LocalBackendId): string | null {
    return this.binOverrides[id] ?? null;
  }

  async snapshot(): Promise<LocalBackendSnapshot[]> {
    const out: LocalBackendSnapshot[] = [];
    for (const def of DEFS) {
      const binPath = await resolveBin(def, this.binOverrides);
      const baseUrl = `http://127.0.0.1:${def.port}/v1`;
      const child = this.children.get(def.id);
      const spawned = Boolean(child && !child.killed && child.exitCode === null);
      const probe = await probeModels(baseUrl);
      out.push({
        id: def.id,
        port: def.port,
        running: spawned || probe.ok,
        baseUrl,
        modelsPreview: probe.models.slice(0, 8),
        binFound: Boolean(binPath),
        binPath,
        installHint: def.installHint,
      });
    }
    return out;
  }

  async start(id: LocalBackendId): Promise<LocalBackendSnapshot> {
    const def = DEFS.find((d) => d.id === id);
    if (!def) {
      throw new Error(`unknown backend ${id}`);
    }
    const existing = this.children.get(id);
    if (existing && !existing.killed && existing.exitCode === null) {
      const snaps = await this.snapshot();
      return snaps.find((s) => s.id === id)!;
    }

    const binPath = await resolveBin(def, this.binOverrides);
    if (!binPath) {
      const snaps = await this.snapshot();
      const snap = snaps.find((s) => s.id === id)!;
      return { ...snap, error: snap.installHint };
    }

    const extra = process.env[def.envArgs]?.trim();
    const args = [
      ...(extra ? extra.split(/\s+/).filter(Boolean) : []),
      '--host',
      '127.0.0.1',
      '--port',
      String(def.port),
    ];

    const child = spawn(binPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    this.children.set(id, child);
    child.stderr?.on('data', (buf: Buffer) => {
      process.stderr.write(`[${id}] ${buf.toString()}`);
    });
    child.on('exit', () => {
      if (this.children.get(id) === child) {
        this.children.delete(id);
      }
    });

    const baseUrl = `http://127.0.0.1:${def.port}/v1`;
    const deadline = Date.now() + 25_000;
    while (Date.now() < deadline) {
      const probe = await probeModels(baseUrl);
      if (probe.ok) {
        break;
      }
      await new Promise((r) => setTimeout(r, 300));
    }

    const snaps = await this.snapshot();
    return snaps.find((s) => s.id === id)!;
  }

  async stop(id: LocalBackendId): Promise<LocalBackendSnapshot> {
    const child = this.children.get(id);
    this.children.delete(id);
    if (child && !child.killed) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          child.kill('SIGKILL');
          resolve();
        }, 4_000);
        child.once('exit', () => {
          clearTimeout(timer);
          resolve();
        });
        child.kill('SIGTERM');
      });
    }
    const snaps = await this.snapshot();
    return snaps.find((s) => s.id === id)!;
  }

  async stopAll(): Promise<void> {
    const ids = [...this.children.keys()];
    await Promise.all(ids.map((id) => this.stop(id)));
  }

  /** Env extras for gateway child so it can prefer these endpoints. */
  async envExtras(): Promise<Record<string, string>> {
    const snaps = await this.snapshot();
    const env: Record<string, string> = {};
    for (const snap of snaps) {
      if (snap.binPath) {
        if (snap.id === 'llama') {
          env['CTRL_LLAMA_BIN'] = snap.binPath;
        }
        if (snap.id === 'litert-lm') {
          env['CTRL_LITERT_LM_BIN'] = snap.binPath;
        }
      }
      if (snap.running) {
        if (snap.id === 'llama') {
          env['CTRL_LLAMA_BASE_URL'] = snap.baseUrl;
        }
        if (snap.id === 'litert-lm') {
          env['CTRL_LITERT_LM_BASE_URL'] = snap.baseUrl;
        }
      }
    }
    return env;
  }
}
