import { mkdirSync, realpathSync } from 'node:fs';
import path from 'node:path';

/**
 * Filesystem jail: all tool paths must resolve under `root`.
 */
export class Sandbox {
  readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
    mkdirSync(this.root, { recursive: true });
  }

  /** Resolve a relative/absolute path and ensure it stays inside the jail. */
  resolve(userPath: string): string {
    const joined = path.resolve(this.root, userPath);
    let realRoot = this.root;
    try {
      realRoot = realpathSync(this.root);
    } catch {
      // root may be brand new
    }
    let realTarget: string;
    try {
      realTarget = realpathSync(joined);
    } catch {
      // file may not exist yet — still check parent containment via string prefix
      const relative = path.relative(realRoot, joined);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error(`path escapes sandbox: ${userPath}`);
      }
      return joined;
    }
    const relative = path.relative(realRoot, realTarget);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(`path escapes sandbox: ${userPath}`);
    }
    return realTarget;
  }
}

/** Allowlisted shell binaries for the sandboxed shell tool. */
export const SHELL_ALLOWLIST = new Set([
  'echo',
  'dir',
  'ls',
  'pwd',
  'type',
  'cat',
  'whoami',
  'hostname',
  'date',
]);

export function parseShellCommand(command: string): {
  bin: string;
  args: string[];
} {
  const trimmed = command.trim();
  if (!trimmed) {
    throw new Error('empty command');
  }
  if (/[;&|`$<>]/.test(trimmed)) {
    throw new Error('shell metacharacters are not allowed');
  }
  const parts = trimmed.split(/\s+/);
  const bin = parts[0]!.toLowerCase();
  if (!SHELL_ALLOWLIST.has(bin)) {
    throw new Error(
      `command not allowlisted: ${bin} (allowed: ${[...SHELL_ALLOWLIST].join(', ')})`
    );
  }
  return { bin: parts[0]!, args: parts.slice(1) };
}
