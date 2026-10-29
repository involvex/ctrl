import { describe, expect, test } from 'bun:test';
import {
  pairingAckInputSchema,
  pairingStatusSchema,
} from './pairing';

describe('pairing ack contract', () => {
  test('accepts optional label', () => {
    expect(pairingAckInputSchema.parse({})).toEqual({});
    expect(pairingAckInputSchema.parse({ label: 'expo-scan' })).toEqual({
      label: 'expo-scan',
    });
  });

  test('pairing status includes lastAck', () => {
    const parsed = pairingStatusSchema.parse({
      required: true,
      port: 7331,
      urls: ['http://192.168.1.10:7331'],
      lastAck: {
        at: '2026-10-28T08:00:00.000Z',
        label: 'expo-scan',
      },
    });
    expect(parsed.lastAck?.label).toBe('expo-scan');
  });
});
