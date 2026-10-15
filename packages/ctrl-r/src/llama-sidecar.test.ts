import { describe, expect, test } from 'bun:test';
import { createLlamaSidecarFromEnv } from './llama-sidecar';

describe('llama sidecar env', () => {
  test('returns null when CTRL_LLAMA_BIN unset', () => {
    expect(createLlamaSidecarFromEnv({})).toBeNull();
  });

  test('builds config from env without starting', () => {
    const sidecar = createLlamaSidecarFromEnv({
      CTRL_LLAMA_BIN: 'llama-server',
      CTRL_LLAMA_PORT: '9090',
      CTRL_LLAMA_HOST: '127.0.0.1',
      CTRL_LLAMA_ARGS: '-m model.gguf',
    });
    expect(sidecar).not.toBeNull();
    expect(sidecar?.getStatus().state).toBe('stopped');
    expect(sidecar?.getBaseUrl()).toBe('http://127.0.0.1:9090/v1');
  });
});
