import { describe, expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Sandbox, parseShellCommand } from './sandbox';

describe('sandbox', () => {
  test('blocks path escape', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'ctrl-sbx-'));
    const sb = new Sandbox(root);
    expect(() => sb.resolve('../outside.txt')).toThrow(/escapes sandbox/);
  });

  test('allowlists shell binaries', () => {
    expect(parseShellCommand('echo hi').bin).toBe('echo');
    expect(() => parseShellCommand('rm -rf /')).toThrow(/not allowlisted/);
    expect(() => parseShellCommand('echo hi; ls')).toThrow(/metacharacters/);
  });
});
