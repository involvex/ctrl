import { describe, expect, test } from 'bun:test';
import type { Conversation, Message } from '@involvex/ctrl-s';
import {
  addHostConversation,
  localMessagesToPush,
  mergeGatewayMessages,
  setConversationGatewayId,
  setGatewayWorkspaceId,
  syncClientBrain,
  type BrainSyncApi,
  type ClientBrainState,
} from './brain';

function emptyBrain(): ClientBrainState {
  return {
    version: 1,
    persona: 'test',
    generator: 'gateway',
    activeConversationId: 'conv_a',
    conversations: [
      { id: 'conv_a', title: 'Chat', updatedAt: 1 },
      { id: 'conv_b', title: 'Second', updatedAt: 2 },
    ],
    messages: [
      {
        id: 'msg_a1',
        conversationId: 'conv_a',
        role: 'user',
        content: 'hello a',
        createdAt: 1,
        updatedAt: 1,
        origin: 'local',
      },
      {
        id: 'msg_b1',
        conversationId: 'conv_b',
        role: 'user',
        content: 'hello b',
        createdAt: 2,
        updatedAt: 2,
        origin: 'local',
      },
    ],
  };
}

describe('brain merge', () => {
  test('keeps local message when gateway is absent', () => {
    const brain = emptyBrain();
    const merged = mergeGatewayMessages(brain, 'conv_a', []);
    expect(
      merged.messages.filter((m) => m.conversationId === 'conv_a')
    ).toHaveLength(1);
    expect(merged.messages[0]!.origin).toBe('local');
  });

  test('pull does not duplicate ids', () => {
    let brain = emptyBrain();
    brain = {
      ...brain,
      messages: [
        {
          id: 'msg_gateway_1',
          conversationId: 'conv_a',
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
    const merged = mergeGatewayMessages(brain, 'conv_a', gateway);
    expect(merged.messages).toHaveLength(2);
  });

  test('localMessagesToPush skips fingerprints already on host', () => {
    const brain = emptyBrain();
    const gateway: Message[] = [
      {
        id: 'other_id',
        conversationId: 'gw',
        role: 'user',
        content: 'hello a',
        createdAt: 9,
      },
    ];
    expect(localMessagesToPush(brain, 'conv_a', gateway)).toHaveLength(0);
  });

  test('merge is scoped per conversation', () => {
    const brain = emptyBrain();
    const gateway: Message[] = [
      {
        id: 'msg_new',
        conversationId: 'gw',
        role: 'assistant',
        content: 'only for a',
        createdAt: 3,
      },
    ];
    const merged = mergeGatewayMessages(brain, 'conv_a', gateway);
    expect(
      merged.messages.filter((m) => m.conversationId === 'conv_a')
    ).toHaveLength(2);
    expect(
      merged.messages.filter((m) => m.conversationId === 'conv_b')
    ).toHaveLength(1);
  });
});

describe('brain sync helpers', () => {
  test('addHostConversation skips when gateway id already linked', () => {
    let brain = emptyBrain();
    brain = setConversationGatewayId(brain, 'conv_a', 'gw_1');
    const next = addHostConversation(brain, {
      id: 'gw_1',
      title: 'Host title',
      updatedAt: 99,
    });
    expect(next.conversations).toHaveLength(2);
    expect(next.conversations.find((c) => c.id === 'conv_a')!.title).toBe(
      'Chat'
    );
  });

  test('addHostConversation adds unseen host thread', () => {
    const brain = emptyBrain();
    const next = addHostConversation(brain, {
      id: 'gw_new',
      title: 'From desktop',
      updatedAt: 50,
    });
    expect(next.conversations).toHaveLength(3);
    const added = next.conversations.find(
      (c) => c.gatewayConversationId === 'gw_new'
    );
    expect(added?.title).toBe('From desktop');
  });
});

describe('syncClientBrain multi-thread', () => {
  test('creates a host conversation per local thread — never conversations[0]', async () => {
    const createdTitles: string[] = [];
    const upserts: Array<{ conversationId: string; ids: string[] }> = [];
    const messagesByGw = new Map<string, Message[]>();

    const api: BrainSyncApi = {
      listWorkspaces: async () => [{ id: 'ws_1', name: 'Mobile' }],
      createWorkspace: async (name) => ({ id: 'ws_new', name }),
      listConversations: async () => [
        {
          id: 'gw_existing',
          workspaceId: 'ws_1',
          title: 'Desktop only',
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      createConversation: async (_ws, title) => {
        createdTitles.push(title ?? 'Chat');
        const id = `gw_created_${createdTitles.length}`;
        const conv: Conversation = {
          id,
          workspaceId: 'ws_1',
          title: title ?? 'Chat',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        messagesByGw.set(id, []);
        return conv;
      },
      listMessages: async (conversationId) =>
        messagesByGw.get(conversationId) ?? [],
      upsertMessages: async (conversationId, items) => {
        upserts.push({
          conversationId,
          ids: items.map((i) => i.id),
        });
        const mapped: Message[] = items.map((i) => ({
          id: i.id,
          conversationId,
          role: i.role,
          content: i.content,
          createdAt: i.createdAt,
        }));
        messagesByGw.set(conversationId, [
          ...(messagesByGw.get(conversationId) ?? []),
          ...mapped,
        ]);
        return mapped;
      },
    };

    const brain = emptyBrain();
    const result = await syncClientBrain(brain, api, {
      workspaceName: 'Mobile',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    // Two local threads without gateway ids → two creates (not attach to gw_existing).
    expect(createdTitles).toEqual(['Chat', 'Second']);
    expect(
      result.brain.conversations.every((c) => c.gatewayConversationId)
    ).toBe(true);
    expect(
      result.brain.conversations.some(
        (c) => c.gatewayConversationId === 'gw_existing'
      )
    ).toBe(true);
    expect(result.brain.gatewayWorkspaceId).toBe('ws_1');
    expect(result.pushed).toBe(2);
    expect(upserts).toHaveLength(2);
    expect(upserts.every((u) => u.conversationId !== 'gw_existing')).toBe(true);
  });

  test('pins workspace and reuses it without creating Mobile/Web again', async () => {
    let createWorkspaceCalls = 0;
    const api: BrainSyncApi = {
      listWorkspaces: async () => [
        { id: 'ws_other', name: 'Other' },
        { id: 'ws_pin', name: 'Mobile' },
      ],
      createWorkspace: async (name) => {
        createWorkspaceCalls += 1;
        return { id: 'ws_new', name };
      },
      listConversations: async () => [],
      createConversation: async (workspaceId, title) => ({
        id: `gw_${title}`,
        workspaceId,
        title: title ?? 'Chat',
        createdAt: 1,
        updatedAt: 1,
      }),
      listMessages: async () => [],
      upsertMessages: async (_id, items) =>
        items.map((i) => ({
          id: i.id,
          conversationId: _id,
          role: i.role,
          content: i.content,
          createdAt: i.createdAt,
        })),
    };

    const brain = setGatewayWorkspaceId(emptyBrain(), 'ws_pin');
    const result = await syncClientBrain(brain, api, {
      workspaceName: 'Mobile',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.brain.gatewayWorkspaceId).toBe('ws_pin');
    expect(createWorkspaceCalls).toBe(0);
  });
});
