import { describe, expect, test } from 'bun:test';
import {
  extractRequestToken,
  gatewayTokenFromEnv,
  isAuthorized,
  isPublicPath,
} from './auth';

describe('gateway auth', () => {
  test('disabled when env token missing', () => {
    expect(gatewayTokenFromEnv({})).toBeNull();
    expect(
      isAuthorized(new Request('http://127.0.0.1/api/v1/workspaces'), null)
    ).toBe(true);
  });

  test('accepts bearer and query token', () => {
    const expected = 'ctrl_test_token';
    const bearer = new Request('http://127.0.0.1/api/v1/workspaces', {
      headers: { Authorization: `Bearer ${expected}` },
    });
    const query = new Request(`http://127.0.0.1/ws/v1/demo?token=${expected}`);
    const bad = new Request('http://127.0.0.1/api/v1/workspaces');
    expect(isAuthorized(bearer, expected)).toBe(true);
    expect(isAuthorized(query, expected)).toBe(true);
    expect(isAuthorized(bad, expected)).toBe(false);
  });

  test('extractRequestToken prefers Authorization', () => {
    const req = new Request('http://127.0.0.1/?token=query', {
      headers: { Authorization: 'Bearer from-header' },
    });
    expect(extractRequestToken(req)).toBe('from-header');
  });

  test('healthz and pairing status are public', () => {
    expect(isPublicPath('/healthz')).toBe(true);
    expect(isPublicPath('/api/v1/pairing')).toBe(true);
    expect(isPublicPath('/api/v1/workspaces')).toBe(false);
  });
});
