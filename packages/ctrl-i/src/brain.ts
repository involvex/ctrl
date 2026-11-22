import type {
  Attachment,
  Conversation,
  KnowledgeChunkExport,
  MemoryItem,
  Message,
} from '@involvex/ctrl-s';
import {
  chunkNoteText,
  clampMemoryContent,
  clampNoteText,
} from './local-knowledge';

/** Message row shared by mobile/web local-first brains. */
export type ClientBrainMessage = {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: number;
  updatedAt: number;
  origin: 'local' | 'gateway';
  provider?: string;
};

/** Conversation row shared by mobile/web local-first brains. */
export type ClientBrainConversation = {
  id: string;
  title: string;
  gatewayConversationId?: string;
  updatedAt: number;
};

/** Local / replicated text note (attachment body without blob). */
export type ClientBrainNote = {
  id: string;
  filename: string;
  text: string;
  createdAt: number;
  origin: 'local' | 'gateway';
  /** Host attachment id after push or when pulled. */
  gatewayAttachmentId?: string;
};

/** Local / replicated memory item. */
export type ClientBrainMemory = {
  id: string;
  kind: 'note' | 'fact' | 'preference';
  content: string;
  pinned: boolean;
  status: 'active' | 'archived' | 'pending_review';
  createdAt: number;
  updatedAt: number;
  origin: 'local' | 'gateway';
  gatewayMemoryId?: string;
  sourceAttachmentId?: string | null;
};

/** Local / replicated knowledge chunk for offline keyword search. */
export type ClientBrainChunk = {
  id: string;
  noteId: string;
  filename: string;
  content: string;
  chunkIndex: number;
  createdAt: number;
  origin: 'local' | 'gateway';
  gatewayChunkId?: string;
  gatewayAttachmentId?: string;
};

/**
 * Minimal brain shape for append-only sync.
 * Clients may carry extra fields (generator union, etc.).
 * version 2 adds notes / memory / chunks (device knowledge).
 */
export type ClientBrainState = {
  version: 2;
  persona: string;
  generator: string;
  activeConversationId: string;
  conversations: ClientBrainConversation[];
  messages: ClientBrainMessage[];
  notes: ClientBrainNote[];
  memory: ClientBrainMemory[];
  chunks: ClientBrainChunk[];
  /** Pinned paired workspace — set after first successful sync. */
  gatewayWorkspaceId?: string;
};

function fingerprint(role: string, content: string): string {
  return `${role}\n${content}`;
}

function noteFingerprint(filename: string, text: string): string {
  return `${filename}\n${text}`;
}

function memoryFingerprint(kind: string, content: string): string {
  return `${kind}\n${content}`;
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Migrate a persisted brain (v1 or partial) to version 2 with knowledge arrays.
 */
export function migrateClientBrainState<T extends Record<string, unknown>>(
  raw: T
): T & ClientBrainState {
  const base = raw as T & Partial<ClientBrainState>;
  const notes = Array.isArray(base.notes) ? base.notes : [];
  const memory = Array.isArray(base.memory) ? base.memory : [];
  const chunks = Array.isArray(base.chunks) ? base.chunks : [];
  return {
    ...base,
    version: 2,
    notes,
    memory,
    chunks,
  } as T & ClientBrainState;
}

/**
 * Append-only merge: keep all local messages; pull gateway messages by id.
 * Never deletes. Skips gateway rows whose id or content fingerprint already exists.
 */
export function mergeGatewayMessages<T extends ClientBrainState>(
  state: T,
  conversationId: string,
  gatewayMessages: readonly Message[]
): T {
  const existingIds = new Set(state.messages.map((m) => m.id));
  const existingFingerprints = new Set(
    state.messages
      .filter((m) => m.conversationId === conversationId)
      .map((m) => fingerprint(m.role, m.content))
  );

  const incoming: ClientBrainMessage[] = [];
  for (const gm of gatewayMessages) {
    if (existingIds.has(gm.id)) {
      continue;
    }
    const fp = fingerprint(gm.role, gm.content);
    if (existingFingerprints.has(fp)) {
      continue;
    }
    existingIds.add(gm.id);
    existingFingerprints.add(fp);
    incoming.push({
      id: gm.id,
      conversationId,
      role: gm.role,
      content: gm.content,
      createdAt: gm.createdAt,
      updatedAt: gm.createdAt,
      origin: 'gateway',
    });
  }

  if (incoming.length === 0) {
    return state;
  }

  return {
    ...state,
    messages: [...state.messages, ...incoming],
  };
}

/** Local-origin messages not yet present on the host (by id or fingerprint). */
export function localMessagesToPush(
  state: ClientBrainState,
  conversationId: string,
  gatewayMessages: readonly Message[]
): ClientBrainMessage[] {
  const gatewayIds = new Set(gatewayMessages.map((m) => m.id));
  const gatewayFingerprints = new Set(
    gatewayMessages.map((m) => fingerprint(m.role, m.content))
  );
  return state.messages.filter((m) => {
    if (m.conversationId !== conversationId) {
      return false;
    }
    if (m.origin !== 'local') {
      return false;
    }
    if (gatewayIds.has(m.id)) {
      return false;
    }
    if (gatewayFingerprints.has(fingerprint(m.role, m.content))) {
      return false;
    }
    return true;
  });
}

/** Bind a local conversation to a host conversation id. */
export function setConversationGatewayId<T extends ClientBrainState>(
  state: T,
  localConversationId: string,
  gatewayConversationId: string
): T {
  const conversations = state.conversations.map((c) => {
    if (c.id !== localConversationId) {
      return c;
    }
    return {
      ...c,
      gatewayConversationId,
      updatedAt: Date.now(),
    };
  });
  return { ...state, conversations };
}

/** Pin the paired workspace after the first successful resolve. */
export function setGatewayWorkspaceId<T extends ClientBrainState>(
  state: T,
  gatewayWorkspaceId: string
): T {
  if (state.gatewayWorkspaceId === gatewayWorkspaceId) {
    return state;
  }
  return { ...state, gatewayWorkspaceId };
}

/**
 * Add a host conversation the client has not seen yet.
 * Does not overwrite titles of conversations already linked by gateway id.
 */
export function addHostConversation<T extends ClientBrainState>(
  state: T,
  host: Pick<Conversation, 'id' | 'title' | 'updatedAt'>
): T {
  const already = state.conversations.some(
    (c) => c.gatewayConversationId === host.id
  );
  if (already) {
    return state;
  }
  const localId = newId('conv');
  const conversation: ClientBrainConversation = {
    id: localId,
    title: host.title,
    gatewayConversationId: host.id,
    updatedAt: host.updatedAt,
  };
  return {
    ...state,
    conversations: [conversation, ...state.conversations],
  };
}

/** Create a local note + keyword chunks (offline knowledge). */
export function addLocalNote<T extends ClientBrainState>(
  state: T,
  input: { filename: string; text: string }
): T {
  const now = Date.now();
  const text = clampNoteText(input.text.trim());
  const filename = input.filename.trim() || 'notes.md';
  if (!text) {
    return state;
  }
  const noteId = newId('note');
  const note: ClientBrainNote = {
    id: noteId,
    filename,
    text,
    createdAt: now,
    origin: 'local',
  };
  const pieces = chunkNoteText(text);
  const chunks: ClientBrainChunk[] = pieces.map((content, chunkIndex) => ({
    id: newId('chk'),
    noteId,
    filename,
    content,
    chunkIndex,
    createdAt: now,
    origin: 'local',
  }));
  return {
    ...state,
    notes: [note, ...state.notes],
    chunks: [...chunks, ...state.chunks],
  };
}

/** Create a local memory item (offline). */
export function addLocalMemory<T extends ClientBrainState>(
  state: T,
  input: {
    content: string;
    kind?: ClientBrainMemory['kind'];
    pinned?: boolean;
    status?: ClientBrainMemory['status'];
  }
): T {
  const content = clampMemoryContent(input.content.trim());
  if (!content) {
    return state;
  }
  const now = Date.now();
  const item: ClientBrainMemory = {
    id: newId('mem'),
    kind: input.kind ?? 'note',
    content,
    pinned: input.pinned ?? true,
    status: input.status ?? 'active',
    createdAt: now,
    updatedAt: now,
    origin: 'local',
  };
  return {
    ...state,
    memory: [item, ...state.memory],
  };
}

/** Append-only pull of host memory items. */
export function mergeGatewayMemory<T extends ClientBrainState>(
  state: T,
  hostItems: readonly MemoryItem[]
): T {
  const existingIds = new Set(state.memory.map((m) => m.id));
  for (const m of state.memory) {
    if (m.gatewayMemoryId) {
      existingIds.add(m.gatewayMemoryId);
    }
  }
  const existingFingerprints = new Set(
    state.memory.map((m) => memoryFingerprint(m.kind, m.content))
  );

  const incoming: ClientBrainMemory[] = [];
  for (const hm of hostItems) {
    if (existingIds.has(hm.id)) {
      continue;
    }
    const content = clampMemoryContent(hm.content);
    const fp = memoryFingerprint(hm.kind, content);
    if (existingFingerprints.has(fp)) {
      continue;
    }
    existingIds.add(hm.id);
    existingFingerprints.add(fp);
    incoming.push({
      id: hm.id,
      kind: hm.kind,
      content,
      pinned: hm.pinned,
      status: hm.status,
      createdAt: hm.createdAt,
      updatedAt: hm.updatedAt,
      origin: 'gateway',
      gatewayMemoryId: hm.id,
      sourceAttachmentId: hm.sourceAttachmentId,
    });
  }

  if (incoming.length === 0) {
    return state;
  }
  return {
    ...state,
    memory: [...state.memory, ...incoming],
  };
}

/** Local-origin memory not yet on the host. */
export function localMemoryToPush(
  state: ClientBrainState,
  hostItems: readonly MemoryItem[]
): ClientBrainMemory[] {
  const hostIds = new Set(hostItems.map((m) => m.id));
  const hostFingerprints = new Set(
    hostItems.map((m) => memoryFingerprint(m.kind, m.content))
  );
  return state.memory.filter((m) => {
    if (m.origin !== 'local') {
      return false;
    }
    if (m.gatewayMemoryId) {
      return false;
    }
    if (hostIds.has(m.id)) {
      return false;
    }
    if (hostFingerprints.has(memoryFingerprint(m.kind, m.content))) {
      return false;
    }
    return true;
  });
}

export function markMemoryPushed<T extends ClientBrainState>(
  state: T,
  localId: string,
  gatewayMemoryId: string
): T {
  return {
    ...state,
    memory: state.memory.map((m) => {
      if (m.id !== localId) {
        return m;
      }
      return { ...m, gatewayMemoryId };
    }),
  };
}

/**
 * Pull host attachments + chunks into notes/chunks (append-only).
 * Binary blobs stay on the host; only chunk text is replicated.
 */
export function mergeGatewayKnowledge<T extends ClientBrainState>(
  state: T,
  hostAttachments: readonly Attachment[],
  hostChunks: readonly KnowledgeChunkExport[]
): T {
  const noteByAttachment = new Map<string, string>();
  const existingNoteIds = new Set(state.notes.map((n) => n.id));
  const existingNoteFingerprints = new Set(
    state.notes.map((n) => noteFingerprint(n.filename, n.text))
  );
  for (const n of state.notes) {
    if (n.gatewayAttachmentId) {
      noteByAttachment.set(n.gatewayAttachmentId, n.id);
      existingNoteIds.add(n.gatewayAttachmentId);
    }
  }

  const chunksByAttachment = new Map<string, KnowledgeChunkExport[]>();
  for (const c of hostChunks) {
    const list = chunksByAttachment.get(c.attachmentId) ?? [];
    list.push(c);
    chunksByAttachment.set(c.attachmentId, list);
  }

  let notes = state.notes;
  let notesMutated = false;
  const incomingChunks: ClientBrainChunk[] = [];

  for (const att of hostAttachments) {
    const attChunks = (chunksByAttachment.get(att.id) ?? [])
      .slice()
      .toSorted((a, b) => a.chunkIndex - b.chunkIndex);
    if (attChunks.length === 0) {
      continue;
    }
    const text = clampNoteText(attChunks.map((c) => c.content).join('\n\n'));
    if (!text) {
      continue;
    }

    let noteId = noteByAttachment.get(att.id);
    if (!noteId) {
      // Fingerprint match: local note already pushed but not yet marked.
      const fp = noteFingerprint(att.filename, text);
      const matched = notes.find(
        (n) =>
          !n.gatewayAttachmentId &&
          noteFingerprint(n.filename, n.text) === fp
      );
      if (matched) {
        noteId = matched.id;
        notes = notes.map((n) =>
          n.id === matched.id
            ? { ...n, gatewayAttachmentId: att.id }
            : n
        );
        notesMutated = true;
        noteByAttachment.set(att.id, noteId);
      } else if (
        !existingNoteIds.has(att.id) &&
        !existingNoteFingerprints.has(fp)
      ) {
        noteId = att.id;
        if (!notesMutated) {
          notes = notes.slice();
          notesMutated = true;
        }
        notes.push({
          id: att.id,
          filename: att.filename,
          text,
          createdAt: att.createdAt,
          origin: 'gateway',
          gatewayAttachmentId: att.id,
        });
        existingNoteIds.add(att.id);
        existingNoteFingerprints.add(fp);
        noteByAttachment.set(att.id, noteId);
      }
    }
  }

  const existingChunkIds = new Set(state.chunks.map((c) => c.id));
  for (const c of state.chunks) {
    if (c.gatewayChunkId) {
      existingChunkIds.add(c.gatewayChunkId);
    }
  }
  const existingChunkFingerprints = new Set(
    state.chunks.map(
      (c) => `${c.gatewayAttachmentId ?? c.noteId}\n${c.content}`
    )
  );

  for (const hc of hostChunks) {
    if (existingChunkIds.has(hc.id)) {
      continue;
    }
    const noteId = noteByAttachment.get(hc.attachmentId);
    if (!noteId) {
      continue;
    }
    const content = clampNoteText(hc.content);
    const fp = `${hc.attachmentId}\n${content}`;
    if (existingChunkFingerprints.has(fp)) {
      continue;
    }
    // Also skip if local chunks for this note already hold the same text.
    const localFp = `${noteId}\n${content}`;
    if (existingChunkFingerprints.has(localFp)) {
      continue;
    }
    existingChunkIds.add(hc.id);
    existingChunkFingerprints.add(fp);
    incomingChunks.push({
      id: hc.id,
      noteId,
      filename: hc.filename,
      content,
      chunkIndex: hc.chunkIndex,
      createdAt: hc.createdAt,
      origin: 'gateway',
      gatewayChunkId: hc.id,
      gatewayAttachmentId: hc.attachmentId,
    });
  }

  if (!notesMutated && incomingChunks.length === 0) {
    return state;
  }

  return {
    ...state,
    notes,
    chunks:
      incomingChunks.length === 0
        ? state.chunks
        : [...state.chunks, ...incomingChunks],
  };
}

/** Local-origin notes not yet uploaded to the host. */
export function localNotesToPush(
  state: ClientBrainState,
  hostAttachments: readonly Attachment[]
): ClientBrainNote[] {
  const hostIds = new Set(hostAttachments.map((a) => a.id));
  // Reconstruct host texts roughly from filenames only when id unknown —
  // fingerprint against uploaded filenames + we rely on post-push merge.
  return state.notes.filter((n) => {
    if (n.origin !== 'local') {
      return false;
    }
    if (n.gatewayAttachmentId) {
      return false;
    }
    if (hostIds.has(n.id)) {
      return false;
    }
    return true;
  });
}

export function markNotePushed<T extends ClientBrainState>(
  state: T,
  localNoteId: string,
  gatewayAttachmentId: string
): T {
  return {
    ...state,
    notes: state.notes.map((n) => {
      if (n.id !== localNoteId) {
        return n;
      }
      return { ...n, gatewayAttachmentId };
    }),
    chunks: state.chunks.map((c) => {
      if (c.noteId !== localNoteId) {
        return c;
      }
      return { ...c, gatewayAttachmentId };
    }),
  };
}

export type BrainSyncApi = {
  listWorkspaces: () => Promise<Array<{ id: string; name: string }>>;
  createWorkspace: (name: string) => Promise<{ id: string; name: string }>;
  listConversations: (workspaceId: string) => Promise<Conversation[]>;
  createConversation: (
    workspaceId: string,
    title?: string
  ) => Promise<Conversation>;
  listMessages: (conversationId: string) => Promise<Message[]>;
  upsertMessages: (
    conversationId: string,
    items: Array<{
      id: string;
      role: Message['role'];
      content: string;
      createdAt: number;
    }>
  ) => Promise<Message[]>;
  listAttachments: (workspaceId: string) => Promise<Attachment[]>;
  listChunks: (workspaceId: string) => Promise<KnowledgeChunkExport[]>;
  uploadAttachmentText: (
    workspaceId: string,
    input: { filename: string; text: string; mimeType?: string }
  ) => Promise<Attachment>;
  listMemory: (workspaceId: string) => Promise<MemoryItem[]>;
  createMemory: (
    workspaceId: string,
    input: {
      content: string;
      kind?: MemoryItem['kind'];
      status?: MemoryItem['status'];
      pinned?: boolean;
    }
  ) => Promise<MemoryItem>;
};

export type BrainSyncOk<T extends ClientBrainState> = {
  ok: true;
  brain: T;
  pushed: number;
  pulled: number;
};

export type BrainSyncFail<T extends ClientBrainState> = {
  ok: false;
  reason: string;
  brain: T;
};

export type BrainSyncResult<T extends ClientBrainState> =
  | BrainSyncOk<T>
  | BrainSyncFail<T>;

/**
 * Multi-conversation + knowledge append-only sync.
 * - Pins workspace id (no `workspaces[0]` after first success).
 * - Each local thread maps to its own host conversation (never `conversations[0]` fallback).
 * - Host threads unknown locally are pulled into the brain.
 * - Notes / memory / chunks replicate append-only (no edit/delete sync).
 */
export async function syncClientBrain<T extends ClientBrainState>(
  brain: T,
  api: BrainSyncApi,
  opts: { workspaceName: string }
): Promise<BrainSyncResult<T>> {
  try {
    let next = migrateClientBrainState(brain as T & Record<string, unknown>);
    let pushed = 0;
    let pulled = 0;

    const workspaces = await api.listWorkspaces();
    let workspaceId = next.gatewayWorkspaceId;
    let ws =
      (workspaceId
        ? workspaces.find((w) => w.id === workspaceId)
        : undefined) ?? null;

    if (!ws) {
      if (workspaceId) {
        // Pin stale — fall through to create/pick by name, then re-pin.
        workspaceId = undefined;
      }
      ws =
        workspaces.find((w) => w.name === opts.workspaceName) ??
        workspaces[0] ??
        null;
      if (!ws) {
        ws = await api.createWorkspace(opts.workspaceName);
      }
    }

    next = setGatewayWorkspaceId(next, ws.id);
    workspaceId = ws.id;

    const hostConversations = await api.listConversations(workspaceId);

    // Pull host threads the client has not linked yet (messages in the loop below).
    for (const host of hostConversations) {
      next = addHostConversation(next, host);
    }

    // Snapshot locals — setConversationGatewayId mutates the conversations array.
    const locals = next.conversations.slice();

    // Sync every local conversation to its own host id.
    for (const local of locals) {
      let gatewayConversationId = local.gatewayConversationId;
      let host =
        gatewayConversationId != null
          ? (hostConversations.find((c) => c.id === gatewayConversationId) ??
            null)
          : null;

      if (!host) {
        // Never attach to conversations[0] — create a dedicated host thread.
        host = await api.createConversation(
          workspaceId,
          local.title.trim() || 'Chat'
        );
        gatewayConversationId = host.id;
        next = setConversationGatewayId(next, local.id, gatewayConversationId);
        hostConversations.push(host);
      } else if (local.gatewayConversationId !== host.id) {
        next = setConversationGatewayId(next, local.id, host.id);
        gatewayConversationId = host.id;
      }

      if (!gatewayConversationId) {
        continue;
      }

      const beforeCount = next.messages.length;
      const remote = await api.listMessages(gatewayConversationId);
      next = mergeGatewayMessages(next, local.id, remote);
      pulled += next.messages.length - beforeCount;

      const toPush = localMessagesToPush(next, local.id, remote);
      if (toPush.length > 0) {
        await api.upsertMessages(
          gatewayConversationId,
          toPush.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            createdAt: m.createdAt,
          }))
        );
        pushed += toPush.length;
      }
    }

    // --- Memory sync ---
    const hostMemory = await api.listMemory(workspaceId);
    const memBefore = next.memory.length;
    next = mergeGatewayMemory(next, hostMemory);
    pulled += next.memory.length - memBefore;

    const memoryPush = localMemoryToPush(next, hostMemory);
    for (const item of memoryPush) {
      const created = await api.createMemory(workspaceId, {
        content: item.content,
        kind: item.kind,
        status: item.status,
        pinned: item.pinned,
      });
      next = markMemoryPushed(next, item.id, created.id);
      pushed += 1;
    }

    // --- Notes / chunks sync ---
    let hostAttachments = await api.listAttachments(workspaceId);
    let hostChunks = await api.listChunks(workspaceId);
    const notesBefore = next.notes.length;
    const chunksBefore = next.chunks.length;
    next = mergeGatewayKnowledge(next, hostAttachments, hostChunks);
    pulled +=
      next.notes.length -
      notesBefore +
      (next.chunks.length - chunksBefore);

    const notesPush = localNotesToPush(next, hostAttachments);
    for (const note of notesPush) {
      const created = await api.uploadAttachmentText(workspaceId, {
        filename: note.filename,
        text: note.text,
        mimeType: 'text/markdown',
      });
      next = markNotePushed(next, note.id, created.id);
      pushed += 1;
    }

    if (notesPush.length > 0 || memoryPush.length > 0) {
      // Refresh host knowledge so newly uploaded chunks land locally.
      hostAttachments = await api.listAttachments(workspaceId);
      hostChunks = await api.listChunks(workspaceId);
      const n2 = next.notes.length;
      const c2 = next.chunks.length;
      next = mergeGatewayKnowledge(next, hostAttachments, hostChunks);
      pulled += next.notes.length - n2 + (next.chunks.length - c2);
    }

    return { ok: true, brain: next, pushed, pulled };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
      brain,
    };
  }
}
