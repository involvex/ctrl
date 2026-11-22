import { describe, expect, test } from 'bun:test';
import type {
  Attachment,
  Conversation,
  KnowledgeChunkExport,
  MemoryItem,
  Message,
} from '@involvex/ctrl-s';
import {
  addHostConversation,
  addLocalMemory,
  addLocalNote,
  localMemoryToPush,
  localMessagesToPush,
  localNotesToPush,
  mergeGatewayKnowledge,
  mergeGatewayMemory,
  mergeGatewayMessages,
  migrateClientBrainState,
  setConversationGatewayId,
  setGatewayWorkspaceId,
  syncClientBrain,
  type BrainSyncApi,
  type ClientBrainState,
} from './brain';
import {
  assembleLocalContextPrefix,
  searchLocalChunks,
} from './local-knowledge';

function emptyBrain(): ClientBrainState {
  return {
    version: 2,
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
    notes: [],
    memory: [],
    chunks: [],
  };
}

function stubKnowledgeApi(overrides: Partial<BrainSyncApi> = {}): BrainSyncApi {
  return {
    listWorkspaces: async () => [{ id: 'ws_1', name: 'Mobile' }],
    createWorkspace: async (name) => ({ id: 'ws_new', name }),
    listConversations: async () => [],
    createConversation: async (workspaceId, title) => ({
      id: `gw_${title ?? 'Chat'}`,
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
    listAttachments: async () => [],
    listChunks: async () => [],
    uploadAttachmentText: async () => {
      throw new Error('upload not stubbed');
    },
    listMemory: async () => [],
    createMemory: async () => {
      throw new Error('createMemory not stubbed');
    },
    ...overrides,
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

describe('brain knowledge', () => {
  test('migrateClientBrainState adds empty knowledge arrays', () => {
    const raw = {
      version: 1,
      persona: 'x',
      generator: 'litert',
      activeConversationId: 'c1',
      conversations: [],
      messages: [],
    };
    const migrated = migrateClientBrainState(raw);
    expect(migrated.version).toBe(2);
    expect(migrated.notes).toEqual([]);
    expect(migrated.memory).toEqual([]);
    expect(migrated.chunks).toEqual([]);
  });

  test('addLocalNote chunks text for offline search', () => {
    let brain = emptyBrain();
    brain = addLocalNote(brain, {
      filename: 'reactor.md',
      text: 'The neon moss coolant loop must be flushed.',
    });
    expect(brain.notes).toHaveLength(1);
    expect(brain.chunks.length).toBeGreaterThan(0);
    const hits = searchLocalChunks(brain.chunks, 'neon moss');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.filename).toBe('reactor.md');
  });

  test('mergeGatewayMemory is append-only and skips fingerprints', () => {
    let brain = addLocalMemory(emptyBrain(), {
      content: 'Prefer Matrix green',
      kind: 'preference',
      pinned: true,
    });
    const host: MemoryItem[] = [
      {
        id: 'mem_host_1',
        workspaceId: 'ws',
        kind: 'preference',
        content: 'Prefer Matrix green',
        sourceAttachmentId: null,
        pinned: true,
        status: 'active',
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: 'mem_host_2',
        workspaceId: 'ws',
        kind: 'fact',
        content: 'Gateway owns SQLite',
        sourceAttachmentId: null,
        pinned: false,
        status: 'active',
        createdAt: 2,
        updatedAt: 2,
      },
    ];
    brain = mergeGatewayMemory(brain, host);
    expect(brain.memory).toHaveLength(2);
    expect(localMemoryToPush(brain, host)).toHaveLength(0);
  });

  test('mergeGatewayKnowledge pulls notes and chunks without duplicates', () => {
    const hostAttachments: Attachment[] = [
      {
        id: 'att_1',
        workspaceId: 'ws',
        conversationId: null,
        filename: 'notes.md',
        mimeType: 'text/markdown',
        sizeBytes: 20,
        blobPath: 'blobs/att_1',
        status: 'ready',
        error: null,
        chunkCount: 1,
        createdAt: 10,
      },
    ];
    const hostChunks: KnowledgeChunkExport[] = [
      {
        id: 'chk_1',
        attachmentId: 'att_1',
        workspaceId: 'ws',
        chunkIndex: 0,
        content: 'Accent color is #00ff66',
        createdAt: 10,
        filename: 'notes.md',
      },
    ];
    let brain = emptyBrain();
    brain = mergeGatewayKnowledge(brain, hostAttachments, hostChunks);
    expect(brain.notes).toHaveLength(1);
    expect(brain.notes[0]!.gatewayAttachmentId).toBe('att_1');
    expect(brain.chunks).toHaveLength(1);
    brain = mergeGatewayKnowledge(brain, hostAttachments, hostChunks);
    expect(brain.notes).toHaveLength(1);
    expect(brain.chunks).toHaveLength(1);
  });

  test('localNotesToPush skips notes already linked to host', () => {
    let brain = addLocalNote(emptyBrain(), {
      filename: 'a.md',
      text: 'hello',
    });
    brain = {
      ...brain,
      notes: brain.notes.map((n) => ({
        ...n,
        gatewayAttachmentId: 'att_x',
      })),
    };
    expect(localNotesToPush(brain, [])).toHaveLength(0);
  });

  test('assembleLocalContextPrefix includes pinned memory and hits', () => {
    let brain = addLocalNote(emptyBrain(), {
      filename: 'loop.md',
      text: 'coolant loop flush schedule',
    });
    brain = addLocalMemory(brain, {
      content: 'Always mention accent #00ff66',
      pinned: true,
      status: 'active',
    });
    const prefix = assembleLocalContextPrefix(brain, 'coolant');
    expect(prefix).toContain('Pinned memory');
    expect(prefix).toContain('#00ff66');
    expect(prefix).toContain('Knowledge hits');
    expect(prefix).toContain('coolant');
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

    const api = stubKnowledgeApi({
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
    });

    const brain = emptyBrain();
    const result = await syncClientBrain(brain, api, {
      workspaceName: 'Mobile',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

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
    const api = stubKnowledgeApi({
      listWorkspaces: async () => [
        { id: 'ws_other', name: 'Other' },
        { id: 'ws_pin', name: 'Mobile' },
      ],
      createWorkspace: async (name) => {
        createWorkspaceCalls += 1;
        return { id: 'ws_new', name };
      },
    });

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

  test('pushes local notes and memory then pulls host chunks', async () => {
    const uploaded: Array<{ filename: string; text: string }> = [];
    const createdMem: Array<{ content: string }> = [];
    let attachments: Attachment[] = [];
    let chunks: KnowledgeChunkExport[] = [];
    let hostMemory: MemoryItem[] = [];

    const api = stubKnowledgeApi({
      listAttachments: async () => attachments,
      listChunks: async () => chunks,
      listMemory: async () => hostMemory,
      uploadAttachmentText: async (_ws, input) => {
        uploaded.push({ filename: input.filename, text: input.text });
        const att: Attachment = {
          id: `att_${uploaded.length}`,
          workspaceId: 'ws_1',
          conversationId: null,
          filename: input.filename,
          mimeType: 'text/markdown',
          sizeBytes: input.text.length,
          blobPath: `blobs/att_${uploaded.length}`,
          status: 'ready',
          error: null,
          chunkCount: 1,
          createdAt: Date.now(),
        };
        attachments = [...attachments, att];
        chunks = [
          ...chunks,
          {
            id: `chk_${uploaded.length}`,
            attachmentId: att.id,
            workspaceId: 'ws_1',
            chunkIndex: 0,
            content: input.text,
            createdAt: att.createdAt,
            filename: input.filename,
          },
        ];
        return att;
      },
      createMemory: async (_ws, input) => {
        createdMem.push({ content: input.content });
        const item: MemoryItem = {
          id: `mem_${createdMem.length}`,
          workspaceId: 'ws_1',
          kind: input.kind ?? 'note',
          content: input.content,
          sourceAttachmentId: null,
          pinned: input.pinned ?? false,
          status: input.status ?? 'active',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        hostMemory = [...hostMemory, item];
        return item;
      },
    });

    let brain = addLocalNote(emptyBrain(), {
      filename: 'phone.md',
      text: 'Phone note about neon moss',
    });
    brain = addLocalMemory(brain, {
      content: 'Pinned on phone',
      pinned: true,
      status: 'active',
    });

    const result = await syncClientBrain(brain, api, {
      workspaceName: 'Mobile',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(uploaded).toHaveLength(1);
    expect(createdMem).toHaveLength(1);
    expect(
      result.brain.notes.some((n) => n.gatewayAttachmentId === 'att_1')
    ).toBe(true);
    expect(result.brain.memory.some((m) => m.gatewayMemoryId === 'mem_1')).toBe(
      true
    );
  });
});
