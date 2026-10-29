import { describe, expect, test } from 'bun:test';
import { createLitertLmSidecarFromEnv } from './litert-sidecar';

describe('litert-lm sidecar env', () => {
  test('returns null when CTRL_LITERT_LM_BIN unset', () => {
    expect(createLitertLmSidecarFromEnv({})).toBeNull();
  });

  test('builds config from env without starting', () => {
    const sidecar = createLitertLmSidecarFromEnv({
      CTRL_LITERT_LM_BIN: 'litert-lm',
      CTRL_LITERT_LM_PORT: '9379',
      CTRL_LITERT_LM_HOST: '127.0.0.1',
    });
    expect(sidecar).not.toBeNull();
    expect(sidecar?.getStatus().state).toBe('stopped');
    expect(sidecar?.getBaseUrl()).toBe('http://127.0.0.1:9379/v1');
  });
});
