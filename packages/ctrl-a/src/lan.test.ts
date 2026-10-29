import { describe, expect, test } from 'bun:test';
import { listLanAddresses } from './lan';

describe('listLanAddresses', () => {
  test('returns unique IPv4 strings without throwing', () => {
    const addrs = listLanAddresses();
    expect(Array.isArray(addrs)).toBe(true);
    for (const ip of addrs) {
      expect(ip).not.toMatch(/^127\./);
      expect(ip).not.toMatch(/^169\.254\./);
    }
    expect(new Set(addrs).size).toBe(addrs.length);
  });
});
