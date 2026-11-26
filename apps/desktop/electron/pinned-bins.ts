import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  createReadStream,
  existsSync,
  readdirSync,
  copyFileSync,
  chmodSync,
  mkdirSync,
} from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import type { LocalBackendId } from './local-backends';

const execFileAsync = promisify(execFile);

export type PinnedBinaryKind = 'archive' | 'file';

export type PinnedBinaryRelease = {
  id: LocalBackendId;
  /** Human label for UI / logs. */
  label: string;
  platform: NodeJS.Platform;
  /** process.arch values this pin matches (e.g. x64, arm64). */
  arch: string[];
  url: string;
  /** Lowercase hex sha256 of the downloaded bytes (archive or file). */
  sha256: string;
  kind: PinnedBinaryKind;
  /**
   * Basename to look for inside an archive (e.g. llama-server.exe).
   * Ignored for kind === 'file'.
   */
  extractName?: string;
  /** Version / release tag for docs. */
  version: string;
};

/**
 * Known-good release pins for Host → download known-good.
 * No silent fetch — user must click. Skip when CTRL_*_BIN already points at a file.
 */
export const PINNED_LOCAL_BINS: PinnedBinaryRelease[] = [
  // llama.cpp b7438 — CPU builds with llama-server inside the archive
  {
    id: 'llama',
    label: 'llama-server (win-cpu-x64)',
    platform: 'win32',
    arch: ['x64'],
    url: 'https://github.com/ggml-org/llama.cpp/releases/download/b7438/llama-b7438-bin-win-cpu-x64.zip',
    sha256: '8d470d77580c2ebc7f4681642f7fac9143800cf6f1d51eea73b01eac37ff9cbe',
    kind: 'archive',
    extractName: 'llama-server.exe',
    version: 'b7438',
  },
  {
    id: 'llama',
    label: 'llama-server (win-cpu-arm64)',
    platform: 'win32',
    arch: ['arm64'],
    url: 'https://github.com/ggml-org/llama.cpp/releases/download/b7438/llama-b7438-bin-win-cpu-arm64.zip',
    sha256: 'c608e57870e766322fd7c36fe7fa976a79237d8b94a9720fea5459e7d44b334c',
    kind: 'archive',
    extractName: 'llama-server.exe',
    version: 'b7438',
  },
  {
    id: 'llama',
    label: 'llama-server (ubuntu-x64)',
    platform: 'linux',
    arch: ['x64'],
    url: 'https://github.com/ggml-org/llama.cpp/releases/download/b7438/llama-b7438-bin-ubuntu-x64.tar.gz',
    sha256: 'a63707871f7a0c4c4124c1280408fd13253bb27549280889371399ad453912d3',
    kind: 'archive',
    extractName: 'llama-server',
    version: 'b7438',
  },
  {
    id: 'llama',
    label: 'llama-server (macos-arm64)',
    platform: 'darwin',
    arch: ['arm64'],
    url: 'https://github.com/ggml-org/llama.cpp/releases/download/b7438/llama-b7438-bin-macos-arm64.tar.gz',
    sha256: 'f1e38e4562fd86bbbcc166e1270acd802d56e916fd484b7b4bc1fb2be0d6101d',
    kind: 'archive',
    extractName: 'llama-server',
    version: 'b7438',
  },
  {
    id: 'llama',
    label: 'llama-server (macos-x64)',
    platform: 'darwin',
    arch: ['x64'],
    url: 'https://github.com/ggml-org/llama.cpp/releases/download/b7438/llama-b7438-bin-macos-x64.tar.gz',
    sha256: '8d2f4c1ec795ba44492d765304fb22c818e69d258ed49791b1f429ddb8851fcd',
    kind: 'archive',
    extractName: 'llama-server',
    version: 'b7438',
  },
  // LiteRT-LM CLI — v0.10.1 ships direct platform binaries (v0.20.0 mac-only in assets)
  {
    id: 'litert-lm',
    label: 'litert-lm (windows_x86_64)',
    platform: 'win32',
    arch: ['x64'],
    url: 'https://github.com/google-ai-edge/LiteRT-LM/releases/download/v0.10.1/litert_lm_main.windows_x86_64.exe',
    sha256: 'f397e61ed51dc0588dbdbecd5156fc7f4b9883aefc75642692ea86c246c5c7ec',
    kind: 'file',
    version: 'v0.10.1',
  },
  {
    id: 'litert-lm',
    label: 'litert-lm (linux_x86_64)',
    platform: 'linux',
    arch: ['x64'],
    url: 'https://github.com/google-ai-edge/LiteRT-LM/releases/download/v0.10.1/litert_lm_main.linux_x86_64',
    sha256: 'eaf985504149b4538ab7c8bbf1e8160799e6379c176a0ffce8ca81593869430e',
    kind: 'file',
    version: 'v0.10.1',
  },
  {
    id: 'litert-lm',
    label: 'litert-lm (macos_arm64)',
    platform: 'darwin',
    arch: ['arm64'],
    url: 'https://github.com/google-ai-edge/LiteRT-LM/releases/download/v0.10.1/litert_lm_main.macos_arm64',
    sha256: '6c0c5d04bce38a2f591f025272df351bbf3fd627b6864aaae80685a5a6df8b5a',
    kind: 'file',
    version: 'v0.10.1',
  },
];

export function envBinKey(id: LocalBackendId): string {
  return id === 'llama' ? 'CTRL_LLAMA_BIN' : 'CTRL_LITERT_LM_BIN';
}

export function resolvePinnedBinary(
  id: LocalBackendId,
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch
): PinnedBinaryRelease | null {
  return (
    PINNED_LOCAL_BINS.find(
      (p) => p.id === id && p.platform === platform && p.arch.includes(arch)
    ) ?? null
  );
}

export function sha256Hex(bytes: Uint8Array | Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function sha256File(filePath: string): Promise<string> {
  return await new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk: string | Buffer) => {
      hash.update(chunk);
    });
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

export function assertSha256(
  actual: string,
  expected: string,
  label: string
): void {
  if (actual.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(
      `checksum mismatch for ${label}: expected ${expected}, got ${actual}`
    );
  }
}

/** True when CTRL_*_BIN is set and the path exists — skip pinned download. */
export function envBinAlreadySet(id: LocalBackendId): string | null {
  const key = envBinKey(id);
  const value = process.env[key]?.trim();
  if (value && existsSync(value)) {
    return value;
  }
  return null;
}

export async function extractArchive(
  archivePath: string,
  destDir: string
): Promise<void> {
  mkdirSync(destDir, { recursive: true });
  // Windows 10+ and Unix: tar extracts .zip and .tar.gz
  await execFileAsync('tar', ['-xf', archivePath, '-C', destDir], {
    windowsHide: true,
  });
}

export function findNamedFile(root: string, basename: string): string | null {
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        stack.push(full);
      } else if (ent.name === basename) {
        return full;
      }
    }
  }
  return null;
}

export function installExtractedBinary(
  sourcePath: string,
  targetPath: string
): void {
  mkdirSync(path.dirname(targetPath), { recursive: true });
  copyFileSync(sourcePath, targetPath);
  if (process.platform !== 'win32') {
    chmodSync(targetPath, 0o755);
  }
}
