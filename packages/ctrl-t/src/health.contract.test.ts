import { describe, expect, test } from 'bun:test';
import { checkHealth } from '@involvex/ctrl-i';
import { healthResponseSchema } from '@involvex/ctrl-s';
import { baseUrl } from './env';

describe('contract: GET /healthz', () => {
  test('returns ok health payload', async () => {
    const body = await checkHealth(baseUrl());
    const parsed = healthResponseSchema.parse(body);
    expect(parsed.ok).toBe(true);
    expect(parsed.service).toBe('ctrl-a');
    expect(parsed.version.length).toBeGreaterThan(0);
  });
});
