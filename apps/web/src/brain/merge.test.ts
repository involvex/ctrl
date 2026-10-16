import { describe, expect, test } from 'bun:test';
import type { Message } from '@involvex/ctrl-s';
import { localMessagesToPush, mergeGatewayMessages } from './merge';
import { appendLocalMessage, createEmptyBrain } from './store';

describe('web brain merge', () => {
  test('keeps local message when gateway is absent', () => {
    let brain = createEmptyBrain('gateway');
    brain = appendLocalMessage(brain, {
      role: 'user',
      content: 'hello offline',
    });
    const merged = mergeGatewayMessages(brain, brain.activeConversationId, []);
    expect(merged.messages).toHaveLength(1);
    expect(merged.messages[0]!.content).toBe('hello offline');
  });

  test('pull does not duplicate ids', () => {
    let brain = createEmptyBrain();
    const convId = brain.activeConversationId;
    brain = {
      ...brain,
      messages: [
        {
          id: 'msg_gateway_1',
          conversationId: convId,
          role: 'user',
          content: 'from host',
          createdAt: 1,
          updatedAt: 1,
          origin: 'gateway',
        },
      ],
    };
    const gateway: Message[] = [
      {
        id: 'msg_gateway_1',
        conversationId: 'gw_conv',
        role: 'user',
        content: 'from host',
        createdAt: 1,
      },
      {
        id: 'msg_gateway_2',
        conversationId: 'gw_conv',
        role: 'assistant',
        content: 'reply',
        createdAt: 2,
      },
    ];
    const merged = mergeGatewayMessages(brain, convId, gateway);
    expect(merged.messages).toHaveLength(2);
  });

  test('localMessagesToPush skips fingerprints already on host', () => {
    let brain = createEmptyBrain();
    const convId = brain.activeConversationId;
    brain = appendLocalMessage(brain, { role: 'user', content: 'same text' });
    const gateway: Message[] = [
      {
        id: 'other_id',
        conversationId: 'gw',
        role: 'user',
        content: 'same text',
        createdAt: 9,
      },
    ];
    expect(localMessagesToPush(brain, convId, gateway)).toHaveLength(0);
  });
});
