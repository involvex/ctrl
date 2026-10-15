#!/usr/bin/env bun
/**
 * Compile @involvex/ctrl-a into a sidecar binary for electron-builder extraResources.
 * Output: apps/desktop/resources/<os>/<arch>/ctrl-a[.exe]
 */
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const serverEntry = path.resolve(
  desktopRoot,
  '../../packages/ctrl-a/src/server.ts'
);

const platform = process.platform;
const arch =
  process.arch === 'x64' || process.arch === 'arm64' ? process.arch : 'x64';

const osDir =
  platform === 'win32' ? 'win' : platform === 'darwin' ? 'mac' : 'linux';

const outDir = path.join(desktopRoot, 'resources', osDir, arch);
const outFile = path.join(
  outDir,
  platform === 'win32' ? 'ctrl-a.exe' : 'ctrl-a'
);

const compileTarget =
  platform === 'win32'
    ? 'bun-windows-x64'
    : platform === 'darwin'
      ? arch === 'arm64'
        ? 'bun-darwin-arm64'
        : 'bun-darwin-x64'
      : arch === 'arm64'
        ? 'bun-linux-arm64'
        : 'bun-linux-x64';

await mkdir(outDir, { recursive: true });

process.stderr.write(
  `[desktop] compiling ctrl-a → ${outFile} (target ${compileTarget})\n`
);

const code = await new Promise<number>((resolve, reject) => {
  const child = spawn(
    'bun',
    [
      'build',
      '--compile',
      `--outfile=${outFile}`,
      `--target=${compileTarget}`,
      serverEntry,
    ],
    {
      cwd: desktopRoot,
      stdio: 'inherit',
      shell: true,
    }
  );
  child.on('error', reject);
  child.on('exit', (exitCode) => {
    resolve(exitCode ?? 1);
  });
});

if (code !== 0) {
  process.exit(code);
}

process.stderr.write(`[desktop] gateway sidecar ready\n`);
