import { describe, expect, test } from 'bun:test';
import {
  createChannel,
  createWorkspace,
  deleteChannel,
  listChannelIdentities,
  listChannels,
  postChannelWebhook,
  sendChannelMessage,
} from '@involvex/ctrl-i';
import { baseUrl } from './env';

describe('contract: channels', () => {
  test('webhook channel: create → inbound → identity → outbound', async () => {
    const ws = await createWorkspace(baseUrl(), 'channels-mvp');
    const channel = await createChannel(baseUrl(), ws.id, {
      kind: 'webhook',
      name: 'test-hook',
      config: { webhookSecret: 's3cret' },
    });
    expect(channel.kind).toBe('webhook');
    expect(channel.status).toBe('running');
    expect('config' in channel).toBe(false);

    const inbound = await postChannelWebhook(
      baseUrl(),
      channel.id,
      {
        externalUserId: 'tg_42',
        text: 'hello from hook',
        displayName: 'Alice',
      },
      's3cret'
    );
    expect(inbound.direction).toBe('inbound');
    expect(inbound.text).toBe('hello from hook');

    const identities = await listChannelIdentities(baseUrl(), channel.id);
    expect(identities.some((i) => i.externalUserId === 'tg_42')).toBe(true);

    const job = await sendChannelMessage(baseUrl(), channel.id, {
      externalUserId: 'tg_42',
      text: 'reply via outbox',
    });
    expect(job.status).toBe('sent');
  });

  test('telegram channel without token: create + mock outbound', async () => {
    const ws = await createWorkspace(baseUrl(), 'channels-telegram');
    const channel = await createChannel(baseUrl(), ws.id, {
      kind: 'telegram',
      name: 'tg-mock',
    });
    expect(channel.kind).toBe('telegram');
    expect(channel.status).toBe('running');
    expect('config' in channel).toBe(false);

    const job = await sendChannelMessage(baseUrl(), channel.id, {
      externalUserId: '1001',
      text: 'hello telegram',
    });
    expect(job.status).toBe('sent');
  });

  test('channel delete removes channel from list', async () => {
    const ws = await createWorkspace(baseUrl(), 'channels-delete');
    const channel = await createChannel(baseUrl(), ws.id, {
      kind: 'webhook',
      name: 'to-delete',
    });
    await deleteChannel(baseUrl(), channel.id);
    const remaining = await listChannels(baseUrl(), ws.id);
    expect(remaining.some((c) => c.id === channel.id)).toBe(false);
  });
});
