import { describe, expect, test } from 'bun:test';
import { ackPairing, getPairingStatus } from '@involvex/ctrl-i';
import { baseUrl } from './env';

describe('contract: pairing ack', () => {
  test('POST /api/v1/pairing/ack → GET shows lastAck', async () => {
    const before = await getPairingStatus(baseUrl());
    expect(before.required).toBe(false);

    await ackPairing(baseUrl(), { label: 'contract-phone' });

    const after = await getPairingStatus(baseUrl());
    expect(after.lastAck).toBeTruthy();
    expect(after.lastAck?.label).toBe('contract-phone');
    expect(typeof after.lastAck?.at).toBe('string');
    expect(after.lastAck!.at.length).toBeGreaterThan(0);
  });
});
