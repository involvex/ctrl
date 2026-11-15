import { describe, expect, test } from 'bun:test';
import type { ChannelConfig } from '@involvex/ctrl-s';
import { discordAdapter, discordMessageToDraft } from './discord';

function channel(config: Record<string, unknown> = {}): ChannelConfig {
  return {
    id: 'ch_discord',
    workspaceId: 'ws_test',
    kind: 'discord',
    name: 'discord',
    config,
    status: 'stopped',
    lastError: null,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('discordMessageToDraft', () => {
  test('maps MESSAGE_CREATE to channel reply target', () => {
    const draft = discordMessageToDraft({
      content: ' hello ',
      channel_id: 'c123',
      author: { id: 'u1', username: 'alice', global_name: 'Alice' },
    });
    expect(draft).toEqual({
      externalUserId: 'c123',
      text: 'hello',
      displayName: 'Alice',
    });
  });

  test('skips bots, webhooks, and empty content', () => {
    expect(
      discordMessageToDraft({
        content: 'hi',
        channel_id: 'c1',
        author: { bot: true, username: 'bot' },
      })
    ).toBeNull();
    expect(
      discordMessageToDraft({
        content: 'hi',
        channel_id: 'c1',
        webhook_id: 'w1',
        author: { username: 'hook' },
      })
    ).toBeNull();
    expect(
      discordMessageToDraft({
        content: '   ',
        channel_id: 'c1',
        author: { username: 'alice' },
      })
    ).toBeNull();
  });
});

describe('discordAdapter', () => {
  test('start/send no-op without credentials', async () => {
    await discordAdapter.start(channel(), () => {
      throw new Error('should not receive inbound');
    });
    await discordAdapter.sendMessage(channel(), 'c1', 'hi');
    await discordAdapter.stop('ch_discord');
  });

  test('sendMessage rejects missing text', async () => {
    await expect(
      discordAdapter.sendMessage(channel({ token: 'x' }), 'c1', '')
    ).rejects.toThrow('missing text');
  });

  test('token=fail simulates send failure', async () => {
    await expect(
      discordAdapter.sendMessage(channel({ token: 'fail' }), 'c1', 'hi')
    ).rejects.toThrow('simulated send failure');
  });
});
