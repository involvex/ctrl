import { describe, expect, test } from 'bun:test';
import type { ChannelConfig } from '@involvex/ctrl-s';
import { telegramAdapter } from './telegram';

function channel(config: Record<string, unknown> = {}): ChannelConfig {
  return {
    id: 'ch_test',
    workspaceId: 'ws_test',
    kind: 'telegram',
    name: 'tg',
    config,
    status: 'stopped',
    lastError: null,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('telegramAdapter', () => {
  test('start/send no-op without token', async () => {
    await telegramAdapter.start(channel(), async () => {
      throw new Error('should not receive inbound');
    });
    await telegramAdapter.sendMessage(channel(), '1', 'hi');
    await telegramAdapter.stop('ch_test');
  });

  test('sendMessage rejects missing recipient', async () => {
    await expect(
      telegramAdapter.sendMessage(channel({ token: 'x' }), '', 'hi')
    ).rejects.toThrow('missing recipient');
  });

  test('token=fail simulates send failure', async () => {
    await expect(
      telegramAdapter.sendMessage(channel({ token: 'fail' }), '1', 'hi')
    ).rejects.toThrow('simulated send failure');
  });
});
