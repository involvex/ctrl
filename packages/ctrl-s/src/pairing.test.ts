import { describe, expect, test } from 'bun:test';
import {
  encodePairPayload,
  parsePairPayload,
  pairPayloadSchema,
} from './pairing';

describe('pairPayload', () => {
  test('round-trips JSON QR payload', () => {
    const raw = encodePairPayload({
      v: 1,
      gatewayUrl: 'http://192.168.178.69:7331',
      token: 'secret',
    });
    const parsed = parsePairPayload(raw);
    expect(parsed).toEqual({
      v: 1,
      gatewayUrl: 'http://192.168.178.69:7331',
      token: 'secret',
    });
  });

  test('accepts bare URL', () => {
    const parsed = parsePairPayload('http://192.168.1.10:7331');
    expect(parsed?.gatewayUrl).toBe('http://192.168.1.10:7331');
    expect(parsed?.token).toBe('');
  });

  test('rejects garbage', () => {
    expect(parsePairPayload('not-a-url')).toBeNull();
  });

  test('defaults empty token', () => {
    const p = pairPayloadSchema.parse({
      v: 1,
      gatewayUrl: 'http://10.0.0.2:7331',
    });
    expect(p.token).toBe('');
  });
});
