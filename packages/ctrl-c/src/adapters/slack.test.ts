import { describe, expect, test } from 'bun:test';
import type { ChannelConfig } from '@involvex/ctrl-s';
import { slackAdapter, slackEventToDraft } from './slack';

function channel(config: Record<string, unknown> = {}): ChannelConfig {
  return {
    id: 'ch_slack',
    workspaceId: 'ws_test',
    kind: 'slack',
    name: 'slack',
    config,
    status: 'stopped',
    lastError: null,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('slackEventToDraft', () => {
  test('maps message events to channel reply target', () => {
    const draft = slackEventToDraft({
      type: 'message',
      user: 'U1',
      channel: 'C9',
      text: ' ping ',
    });
    expect(draft).toEqual({
      externalUserId: 'C9',
      text: 'ping',
      displayName: 'U1',
    });
  });

  test('skips subtypes, bots, and non-message events', () => {
    expect(
      slackEventToDraft({
        type: 'message',
        subtype: 'bot_message',
        user: 'U1',
        channel: 'C1',
        text: 'hi',
      })
    ).toBeNull();
    expect(
      slackEventToDraft({
        type: 'message',
        bot_id: 'B1',
        channel: 'C1',
        text: 'hi',
      })
    ).toBeNull();
    expect(
      slackEventToDraft({
        type: 'app_mention',
        user: 'U1',
        channel: 'C1',
        text: 'hi',
      })
    ).toBeNull();
  });
});

describe('slackAdapter', () => {
  test('start/send no-op without credentials', async () => {
    await slackAdapter.start(channel(), () => {
      throw new Error('should not receive inbound');
    });
    await slackAdapter.sendMessage(channel(), 'C1', 'hi');
    await slackAdapter.stop('ch_slack');
  });

  test('sendMessage rejects missing text', async () => {
    await expect(
      slackAdapter.sendMessage(channel({ token: 'x' }), 'C1', '')
    ).rejects.toThrow('missing text');
  });

  test('token=fail simulates send failure', async () => {
    await expect(
      slackAdapter.sendMessage(channel({ token: 'fail' }), 'C1', 'hi')
    ).rejects.toThrow('simulated send failure');
  });
});
