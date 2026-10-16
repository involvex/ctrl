import { describe, expect, test } from 'bun:test';
import {
  CLI_COMMANDS,
  completionScript,
  parseCompletionShell,
} from './completion';

describe('ctrl-f5 completion', () => {
  test('bash script includes commands and complete hook', () => {
    const script = completionScript('bash');
    for (const cmd of CLI_COMMANDS) {
      expect(script).toContain(cmd);
    }
    expect(script).toContain('complete -F _ctrl_f5 ctrl-f5');
  });

  test('powershell script registers native completer', () => {
    const script = completionScript('powershell');
    expect(script).toContain('Register-ArgumentCompleter');
    expect(script).toContain('ctrl-f5');
  });

  test('parseCompletionShell rejects unknown shells', () => {
    expect(parseCompletionShell('bash')).toBe('bash');
    expect(parseCompletionShell('powershell')).toBe('powershell');
    expect(() => parseCompletionShell('zsh')).toThrow();
  });
});
