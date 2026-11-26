import { describe, expect, test } from 'bun:test';
import {
  PINNED_LOCAL_BINS,
  assertSha256,
  envBinKey,
  resolvePinnedBinary,
  sha256Hex,
} from './pinned-bins';

describe('pinned local bins', () => {
  test('every pin has https github URL and 64-char sha256', () => {
    expect(PINNED_LOCAL_BINS.length).toBeGreaterThan(0);
    for (const pin of PINNED_LOCAL_BINS) {
      expect(pin.url.startsWith('https://github.com/')).toBe(true);
      expect(pin.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(pin.version.length).toBeGreaterThan(0);
      expect(pin.arch.length).toBeGreaterThan(0);
      if (pin.kind === 'archive') {
        expect(pin.extractName).toBeTruthy();
      }
    }
  });

  test('resolvePinnedBinary covers win/linux/mac for llama', () => {
    expect(resolvePinnedBinary('llama', 'win32', 'x64')?.extractName).toBe(
      'llama-server.exe'
    );
    expect(resolvePinnedBinary('llama', 'linux', 'x64')?.extractName).toBe(
      'llama-server'
    );
    expect(resolvePinnedBinary('llama', 'darwin', 'arm64')?.kind).toBe(
      'archive'
    );
    expect(resolvePinnedBinary('llama', 'freebsd', 'x64')).toBeNull();
  });

  test('resolvePinnedBinary covers litert-lm file pins', () => {
    const win = resolvePinnedBinary('litert-lm', 'win32', 'x64');
    expect(win?.kind).toBe('file');
    expect(win?.url.endsWith('.exe')).toBe(true);
    expect(resolvePinnedBinary('litert-lm', 'linux', 'x64')?.kind).toBe('file');
    expect(resolvePinnedBinary('litert-lm', 'darwin', 'arm64')?.kind).toBe(
      'file'
    );
  });

  test('envBinKey and sha256 helpers', () => {
    expect(envBinKey('llama')).toBe('CTRL_LLAMA_BIN');
    expect(envBinKey('litert-lm')).toBe('CTRL_LITERT_LM_BIN');
    const hex = sha256Hex(Buffer.from('ctrl'));
    expect(hex).toMatch(/^[a-f0-9]{64}$/);
    expect(() => assertSha256(hex, hex, 'ok')).not.toThrow();
    expect(() => assertSha256(hex, '0'.repeat(64), 'bad')).toThrow(
      /checksum mismatch/
    );
  });
});
