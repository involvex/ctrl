import { describe, expect, test } from 'bun:test';
import {
  createChannel,
  createWorkspace,
  listChannelMessages,
  postChannelWebhook,
  streamApprovals,
} from '@involvex/ctrl-i';
import { type AgentEvent } from '@involvex/ctrl-s';
import { baseUrl } from './env';

describe('contract: channel inbound approvals', () => {
  test('no listener → shell inbound denies without long stall', async () => {
    const ws = await createWorkspace(baseUrl(), 'ch-apr-deny');
    const channel = await createChannel(baseUrl(), ws.id, {
      kind: 'webhook',
      name: 'deny-hook',
      config: { webhookSecret: 'deny-secret' },
    });

    const started = Date.now();
    await postChannelWebhook(
      baseUrl(),
      channel.id,
      {
        externalUserId: 'u_deny',
        text: '/tool shell echo should-deny',
      },
      'deny-secret'
    );
    const elapsed = Date.now() - started;

    const messages = await listChannelMessages(baseUrl(), channel.id);
    const outbound = messages.filter((m) => m.direction === 'outbound');
    expect(
      outbound.some(
        (m) =>
          m.text.toLowerCase().includes('shell') &&
          m.text.toLowerCase().includes('denied')
      )
    ).toBe(true);
    expect(elapsed).toBeLessThan(8_000);
  });

  test('workspace approvals listener can approve channel shell', async () => {
    const ws = await createWorkspace(baseUrl(), 'ch-apr-ok');
    const channel = await createChannel(baseUrl(), ws.id, {
      kind: 'webhook',
      name: 'ok-hook',
      config: { webhookSecret: 'ok-secret' },
    });

    const events: AgentEvent[] = [];
    let resolved = false;
    const session = await new Promise<ReturnType<typeof streamApprovals>>(
      (resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('approvals ws open timed out')),
          5_000
        );
        const s = streamApprovals(baseUrl(), ws.id, {
          onEvent: (event) => {
            events.push(event);
            if (
              event.type === 'approval.requested' &&
              event.source === 'channel' &&
              !resolved
            ) {
              resolved = true;
              s.resolveApproval(event.approvalId, 'approved');
            }
          },
          onError: (err) => {
            clearTimeout(timeout);
            reject(err);
          },
        });
        // WebSocket open is not exposed; short delay then proceed.
        void Bun.sleep(300).then(() => {
          clearTimeout(timeout);
          resolve(s);
        });
      }
    );

    await postChannelWebhook(
      baseUrl(),
      channel.id,
      {
        externalUserId: 'u_ok',
        text: '/tool shell echo channel-approved',
      },
      'ok-secret'
    );

    session.close();

    expect(
      events.some(
        (e) => e.type === 'approval.requested' && e.source === 'channel'
      )
    ).toBe(true);
    expect(
      events.some(
        (e) =>
          e.type === 'approval.resolved' &&
          e.source === 'channel' &&
          e.decision === 'approved'
      )
    ).toBe(true);

    const messages = await listChannelMessages(baseUrl(), channel.id);
    expect(
      messages.some(
        (m) => m.direction === 'outbound' && m.text.includes('channel-approved')
      )
    ).toBe(true);
  });
});
