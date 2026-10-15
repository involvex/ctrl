import { describe, expect, test } from 'bun:test';
import { baseUrl } from './env';

/**
 * Default contract gateway has no CTRL_GATEWAY_TOKEN (open mode).
 * Auth enforcement is covered by ctrl-a unit tests; this checks the pairing
 * status endpoint exists and reports open mode under the live harness.
 */
describe('contract: pairing status', () => {
  test('GET /api/v1/pairing reports auth mode', async () => {
    const res = await fetch(`${baseUrl()}/api/v1/pairing`);
    expect(res.ok).toBe(true);
    const body: unknown = await res.json();
    expect(body && typeof body === 'object').toBe(true);
    if (body && typeof body === 'object' && 'required' in body) {
      expect(typeof body.required).toBe('boolean');
      // live harness leaves token unset
      expect(body.required).toBe(false);
    }
  });
});
