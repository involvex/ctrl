import { describe, expect, test } from 'bun:test';
import { clearClientAuth, setClientAuth } from '@involvex/ctrl-i';
import { baseUrl } from './env';

/**
 * Runs only under the tokened gateway pass in with-gateway.ts
 * (`CTRL_CONTRACT_TOKENED=1` + `CTRL_GATEWAY_TOKEN` matching the server).
 */
const tokened = process.env['CTRL_CONTRACT_TOKENED'] === '1';
const expectedToken = process.env['CTRL_GATEWAY_TOKEN']?.trim() ?? '';

describe.skipIf(!tokened || !expectedToken)('contract: bearer auth', () => {
  test('protected route 401 without bearer', async () => {
    clearClientAuth();
    const res = await fetch(`${baseUrl()}/api/v1/workspaces`);
    expect(res.status).toBe(401);
  });

  test('protected route succeeds with bearer', async () => {
    setClientAuth({ token: expectedToken });
    const res = await fetch(`${baseUrl()}/api/v1/workspaces`, {
      headers: { Authorization: `Bearer ${expectedToken}` },
    });
    expect(res.ok).toBe(true);
    clearClientAuth();
  });

  test('pairing stays public when token required', async () => {
    clearClientAuth();
    const res = await fetch(`${baseUrl()}/api/v1/pairing`);
    expect(res.ok).toBe(true);
    const body: unknown = await res.json();
    expect(body && typeof body === 'object' && 'required' in body).toBe(true);
    if (body && typeof body === 'object' && 'required' in body) {
      expect(body.required).toBe(true);
    }
  });
});
