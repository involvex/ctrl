import type {
  Attachment,
  Conversation,
  KnowledgeChunkExport,
  MemoryItem,
  Message,
  UpdateMemoryInput,
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
  updatedAt: number;
  /** Tombstone — skip resurrect on pull; push soft-delete when linked. */
  deletedAt?: number;
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
  /** Tombstone — push archive when linked; never resurrect from host. */
  deletedAt?: number;
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
 * Minimal brain shape for sync.
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

function asNonEmptyString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function normalizeNote(raw: Record<string, unknown>): ClientBrainNote {
  const createdAt =
    typeof raw['createdAt'] === 'number' ? raw['createdAt'] : Date.now();
  const updatedAt =
    typeof raw['updatedAt'] === 'number' ? raw['updatedAt'] : createdAt;
  const deletedAt =
    typeof raw['deletedAt'] === 'number' ? raw['deletedAt'] : undefined;
  return {
    id: asNonEmptyString(raw['id'], newId('note')),
    filename: asNonEmptyString(raw['filename'], 'notes.md'),
    text: asString(raw['text']),
    createdAt,
    updatedAt,
    ...(deletedAt !== undefined ? { deletedAt } : {}),
    origin: raw['origin'] === 'gateway' ? 'gateway' : 'local',
    ...(typeof raw['gatewayAttachmentId'] === 'string'
      ? { gatewayAttachmentId: raw['gatewayAttachmentId'] }
      : {}),
  };
}

function normalizeMemory(raw: Record<string, unknown>): ClientBrainMemory {
  const createdAt =
    typeof raw['createdAt'] === 'number' ? raw['createdAt'] : Date.now();
  const updatedAt =
    typeof raw['updatedAt'] === 'number' ? raw['updatedAt'] : createdAt;
  const deletedAt =
    typeof raw['deletedAt'] === 'number' ? raw['deletedAt'] : undefined;
  const kind = raw['kind'];
  const status = raw['status'];
  const sourceAttachmentId = raw['sourceAttachmentId'];
  return {
    id: asNonEmptyString(raw['id'], newId('mem')),
    kind:
      kind === 'fact' || kind === 'preference' || kind === 'note'
        ? kind
        : 'note',
    content: asString(raw['content']),
    pinned: Boolean(raw['pinned']),
    status:
      status === 'archived' ||
      status === 'pending_review' ||
      status === 'active'
        ? status
        : 'active',
    createdAt,
    updatedAt,
    ...(deletedAt !== undefined ? { deletedAt } : {}),
    origin: raw['origin'] === 'gateway' ? 'gateway' : 'local',
    ...(typeof raw['gatewayMemoryId'] === 'string'
      ? { gatewayMemoryId: raw['gatewayMemoryId'] }
      : {}),
    ...(sourceAttachmentId === null || typeof sourceAttachmentId === 'string'
      ? { sourceAttachmentId }
      : {}),
  };
}

function rebuildNoteChunks(
  note: ClientBrainNote,
  now: number
): ClientBrainChunk[] {
  if (note.deletedAt != null) {
    return [];
  }
  const pieces = chunkNoteText(note.text);
  const chunks: ClientBrainChunk[] = [];
  for (let chunkIndex = 0; chunkIndex < pieces.length; chunkIndex++) {
    const content = pieces[chunkIndex]!;
    const chunk: ClientBrainChunk = {
      id: newId('chk'),
      noteId: note.id,
      filename: note.filename,
      content,
      chunkIndex,
      createdAt: now,
      origin: note.origin,
    };
    if (note.gatewayAttachmentId) {
      chunk.gatewayAttachmentId = note.gatewayAttachmentId;
    }
    chunks.push(chunk);
  }
  return chunks;
}

function replaceChunksForNote<T extends ClientBrainState>(
  state: T,
  noteId: string,
  nextChunks: ClientBrainChunk[]
): T {
  return {
    ...state,
    chunks: [...state.chunks.filter((c) => c.noteId !== noteId), ...nextChunks],
  };
}

/**
 * Migrate a persisted brain (v1 or partial) to version 2 with knowledge arrays.
 */
export function migrateClientBrainState<T extends Record<string, unknown>>(
  raw: T
): T & ClientBrainState {
  const base = raw as T & Partial<ClientBrainState>;
  const notes = (Array.isArray(base.notes) ? base.notes : []).map((n) =>
    normalizeNote(n as unknown as Record<string, unknown>)
  );
  const memory = (Array.isArray(base.memory) ? base.memory : []).map((m) =>
    normalizeMemory(m as unknown as Record<string, unknown>)
  );
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
    updatedAt: now,
    origin: 'local',
  };
  const chunks = rebuildNoteChunks(note, now);
  return {
    ...state,
    notes: [note, ...state.notes],
    chunks: [...chunks, ...state.chunks],
  };
}

/** Edit a local note (last-write-wins via updatedAt). */
export function updateLocalNote<T extends ClientBrainState>(
  state: T,
  noteId: string,
  input: { filename?: string; text?: string }
): T {
  const existing = state.notes.find((n) => n.id === noteId);
  if (!existing || existing.deletedAt != null) {
    return state;
  }
  const now = Date.now();
  const text =
    input.text !== undefined ? clampNoteText(input.text.trim()) : existing.text;
  if (!text) {
    return state;
  }
  const filename =
    input.filename !== undefined
      ? input.filename.trim() || existing.filename
      : existing.filename;
  const note: ClientBrainNote = {
    ...existing,
    filename,
    text,
    updatedAt: now,
    origin: 'local',
  };
  const withNote = {
    ...state,
    notes: state.notes.map((n) => (n.id === noteId ? note : n)),
  };
  return replaceChunksForNote(withNote, noteId, rebuildNoteChunks(note, now));
}

/** Tombstone a local note and drop its chunks from offline search. */
export function deleteLocalNote<T extends ClientBrainState>(
  state: T,
  noteId: string
): T {
  const existing = state.notes.find((n) => n.id === noteId);
  if (!existing || existing.deletedAt != null) {
    return state;
  }
  const now = Date.now();
  return {
    ...state,
    notes: state.notes.map((n) =>
      n.id === noteId
        ? { ...n, deletedAt: now, updatedAt: now, origin: 'local' as const }
        : n
    ),
    chunks: state.chunks.filter((c) => c.noteId !== noteId),
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

/** Edit a local memory item. */
export function updateLocalMemory<T extends ClientBrainState>(
  state: T,
  memoryId: string,
  input: {
    content?: string;
    kind?: ClientBrainMemory['kind'];
    pinned?: boolean;
    status?: ClientBrainMemory['status'];
  }
): T {
  const existing = state.memory.find((m) => m.id === memoryId);
  if (!existing || existing.deletedAt != null) {
    return state;
  }
  const content =
    input.content !== undefined
      ? clampMemoryContent(input.content.trim())
      : existing.content;
  if (!content) {
    return state;
  }
  const now = Date.now();
  return {
    ...state,
    memory: state.memory.map((m) =>
      m.id === memoryId
        ? {
            ...m,
            content,
            kind: input.kind ?? m.kind,
            pinned: input.pinned ?? m.pinned,
            status: input.status ?? m.status,
            updatedAt: now,
            origin: 'local' as const,
          }
        : m
    ),
  };
}

/** Tombstone a local memory item (archives on next host push). */
export function deleteLocalMemory<T extends ClientBrainState>(
  state: T,
  memoryId: string
): T {
  const existing = state.memory.find((m) => m.id === memoryId);
  if (!existing || existing.deletedAt != null) {
    return state;
  }
  const now = Date.now();
  return {
    ...state,
    memory: state.memory.map((m) =>
      m.id === memoryId
        ? {
            ...m,
            deletedAt: now,
            updatedAt: now,
            status: 'archived' as const,
            pinned: false,
            origin: 'local' as const,
          }
        : m
    ),
  };
}

function findLocalMemory(
  state: ClientBrainState,
  hostId: string
): ClientBrainMemory | undefined {
  return state.memory.find(
    (m) => m.gatewayMemoryId === hostId || m.id === hostId
  );
}

function isMemoryTombstoned(m: ClientBrainMemory): boolean {
  return m.deletedAt != null || m.status === 'archived';
}

/**
 * Last-write-wins memory merge. Tombstones never resurrect from an older host copy.
 */
export function mergeGatewayMemory<T extends ClientBrainState>(
  state: T,
  hostItems: readonly MemoryItem[]
): T {
  const memory = state.memory.slice();
  let mutated = false;

  const tombstoneIds = new Set<string>();
  for (const m of memory) {
    if (isMemoryTombstoned(m)) {
      tombstoneIds.add(m.id);
      if (m.gatewayMemoryId) {
        tombstoneIds.add(m.gatewayMemoryId);
      }
    }
  }

  for (const hm of hostItems) {
    const content = clampMemoryContent(hm.content);
    const hostDeleted = hm.status === 'archived';
    const local = findLocalMemory({ ...state, memory }, hm.id);

    if (local) {
      if (isMemoryTombstoned(local) && local.updatedAt >= hm.updatedAt) {
        continue;
      }
      if (local.updatedAt > hm.updatedAt) {
        continue;
      }
      if (
        local.updatedAt === hm.updatedAt &&
        local.content === content &&
        local.status === hm.status &&
        local.pinned === hm.pinned &&
        (local.gatewayMemoryId ?? local.id) === hm.id
      ) {
        continue;
      }
      const idx = memory.findIndex((m) => m.id === local.id);
      if (idx < 0) {
        continue;
      }
      mutated = true;
      memory[idx] = {
        ...local,
        kind: hm.kind,
        content,
        pinned: hostDeleted ? false : hm.pinned,
        status: hm.status,
        updatedAt: hm.updatedAt,
        createdAt: hm.createdAt,
        origin: 'gateway',
        gatewayMemoryId: hm.id,
        sourceAttachmentId: hm.sourceAttachmentId,
        ...(hostDeleted
          ? { deletedAt: hm.updatedAt }
          : { deletedAt: undefined }),
      };
      if (hostDeleted) {
        tombstoneIds.add(local.id);
        tombstoneIds.add(hm.id);
      }
      continue;
    }

    if (tombstoneIds.has(hm.id)) {
      continue;
    }

    const fp = memoryFingerprint(hm.kind, content);
    const fpMatch = memory.find(
      (m) =>
        !m.gatewayMemoryId &&
        !isMemoryTombstoned(m) &&
        memoryFingerprint(m.kind, m.content) === fp
    );
    if (fpMatch) {
      const idx = memory.findIndex((m) => m.id === fpMatch.id);
      if (idx >= 0) {
        mutated = true;
        memory[idx] = {
          ...fpMatch,
          gatewayMemoryId: hm.id,
          updatedAt: Math.max(fpMatch.updatedAt, hm.updatedAt),
        };
      }
      continue;
    }

    if (hostDeleted) {
      // Host-only archived item — record tombstone so we never recreate.
      mutated = true;
      memory.push({
        id: hm.id,
        kind: hm.kind,
        content,
        pinned: false,
        status: 'archived',
        createdAt: hm.createdAt,
        updatedAt: hm.updatedAt,
        deletedAt: hm.updatedAt,
        origin: 'gateway',
        gatewayMemoryId: hm.id,
        sourceAttachmentId: hm.sourceAttachmentId,
      });
      tombstoneIds.add(hm.id);
      continue;
    }

    mutated = true;
    memory.push({
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

  if (!mutated) {
    return state;
  }
  return { ...state, memory };
}

/** Local-origin memory not yet on the host (creates only). */
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
    if (isMemoryTombstoned(m)) {
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

/** Linked local memory newer than host — PATCH on sync. */
export function localMemoryToUpdate(
  state: ClientBrainState,
  hostItems: readonly MemoryItem[]
): ClientBrainMemory[] {
  const byId = new Map(hostItems.map((m) => [m.id, m]));
  return state.memory.filter((m) => {
    if (!m.gatewayMemoryId) {
      return false;
    }
    if (isMemoryTombstoned(m)) {
      return false;
    }
    const host = byId.get(m.gatewayMemoryId);
    if (!host) {
      return false;
    }
    if (host.status === 'archived') {
      return false;
    }
    return m.updatedAt > host.updatedAt;
  });
}

/** Local tombstones that still need host archive. */
export function localMemoryToDelete(
  state: ClientBrainState,
  hostItems: readonly MemoryItem[]
): ClientBrainMemory[] {
  const byId = new Map(hostItems.map((m) => [m.id, m]));
  return state.memory.filter((m) => {
    if (!m.gatewayMemoryId) {
      return false;
    }
    if (!isMemoryTombstoned(m)) {
      return false;
    }
    const host = byId.get(m.gatewayMemoryId);
    if (!host) {
      return false;
    }
    return host.status !== 'archived';
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

function findLocalNote(
  state: ClientBrainState,
  attachmentId: string
): ClientBrainNote | undefined {
  return state.notes.find(
    (n) => n.gatewayAttachmentId === attachmentId || n.id === attachmentId
  );
}

function hostAttachmentText(
  att: Attachment,
  chunksByAttachment: Map<string, KnowledgeChunkExport[]>
): string {
  const attChunks = (chunksByAttachment.get(att.id) ?? []).slice();
  attChunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
  return clampNoteText(attChunks.map((c) => c.content).join('\n\n'));
}

/**
 * Pull host attachments + chunks with last-write-wins and tombstones.
 * Binary blobs stay on the host; only chunk text is replicated.
 */
export function mergeGatewayKnowledge<T extends ClientBrainState>(
  state: T,
  hostAttachments: readonly Attachment[],
  hostChunks: readonly KnowledgeChunkExport[]
): T {
  const notes = state.notes.slice();
  let chunks = state.chunks.slice();
  let mutated = false;

  const tombstoneIds = new Set<string>();
  for (const n of notes) {
    if (n.deletedAt != null) {
      tombstoneIds.add(n.id);
      if (n.gatewayAttachmentId) {
        tombstoneIds.add(n.gatewayAttachmentId);
      }
    }
  }

  const chunksByAttachment = new Map<string, KnowledgeChunkExport[]>();
  for (const c of hostChunks) {
    const list = chunksByAttachment.get(c.attachmentId) ?? [];
    list.push(c);
    chunksByAttachment.set(c.attachmentId, list);
  }

  const applyHostChunks = (
    noteId: string,
    attachmentId: string,
    filename: string
  ): void => {
    const attChunks = (chunksByAttachment.get(attachmentId) ?? []).slice();
    attChunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
    const next: ClientBrainChunk[] = [];
    for (const hc of attChunks) {
      next.push({
        id: hc.id,
        noteId,
        filename,
        content: clampNoteText(hc.content),
        chunkIndex: hc.chunkIndex,
        createdAt: hc.createdAt,
        origin: 'gateway',
        gatewayChunkId: hc.id,
        gatewayAttachmentId: attachmentId,
      });
    }
    chunks = chunks.filter((c) => c.noteId !== noteId);
    chunks.push(...next);
  };

  for (const att of hostAttachments) {
    const hostDeleted = att.deletedAt != null;
    const text = hostDeleted ? '' : hostAttachmentText(att, chunksByAttachment);
    const local = findLocalNote({ ...state, notes }, att.id);

    if (local) {
      if (local.deletedAt != null && local.updatedAt >= att.updatedAt) {
        continue;
      }
      if (local.updatedAt > att.updatedAt) {
        continue;
      }
      if (
        local.updatedAt === att.updatedAt &&
        local.filename === att.filename &&
        local.text === text &&
        (local.deletedAt != null) === hostDeleted &&
        local.gatewayAttachmentId === att.id
      ) {
        continue;
      }
      const idx = notes.findIndex((n) => n.id === local.id);
      if (idx < 0) {
        continue;
      }
      mutated = true;
      if (hostDeleted) {
        notes[idx] = {
          ...local,
          filename: att.filename,
          updatedAt: att.updatedAt,
          deletedAt: att.deletedAt ?? att.updatedAt,
          origin: 'gateway',
          gatewayAttachmentId: att.id,
        };
        chunks = chunks.filter((c) => c.noteId !== local.id);
        tombstoneIds.add(local.id);
        tombstoneIds.add(att.id);
      } else {
        notes[idx] = {
          ...local,
          filename: att.filename,
          text,
          updatedAt: att.updatedAt,
          createdAt: att.createdAt,
          origin: 'gateway',
          gatewayAttachmentId: att.id,
          deletedAt: undefined,
        };
        applyHostChunks(local.id, att.id, att.filename);
      }
      continue;
    }

    if (tombstoneIds.has(att.id)) {
      continue;
    }

    if (hostDeleted) {
      mutated = true;
      notes.push({
        id: att.id,
        filename: att.filename,
        text: '',
        createdAt: att.createdAt,
        updatedAt: att.updatedAt,
        deletedAt: att.deletedAt ?? att.updatedAt,
        origin: 'gateway',
        gatewayAttachmentId: att.id,
      });
      tombstoneIds.add(att.id);
      continue;
    }

    if (!text) {
      continue;
    }

    const fp = noteFingerprint(att.filename, text);
    const fpMatch = notes.find(
      (n) =>
        !n.gatewayAttachmentId &&
        n.deletedAt == null &&
        noteFingerprint(n.filename, n.text) === fp
    );
    if (fpMatch) {
      const idx = notes.findIndex((n) => n.id === fpMatch.id);
      if (idx >= 0) {
        mutated = true;
        notes[idx] = {
          ...fpMatch,
          gatewayAttachmentId: att.id,
          updatedAt: Math.max(fpMatch.updatedAt, att.updatedAt),
        };
        chunks = chunks.map((c) =>
          c.noteId === fpMatch.id ? { ...c, gatewayAttachmentId: att.id } : c
        );
      }
      continue;
    }

    mutated = true;
    notes.push({
      id: att.id,
      filename: att.filename,
      text,
      createdAt: att.createdAt,
      updatedAt: att.updatedAt,
      origin: 'gateway',
      gatewayAttachmentId: att.id,
    });
    applyHostChunks(att.id, att.id, att.filename);
  }

  if (!mutated) {
    return state;
  }
  return { ...state, notes, chunks };
}

/** Local-origin notes not yet uploaded to the host. */
export function localNotesToPush(
  state: ClientBrainState,
  hostAttachments: readonly Attachment[]
): ClientBrainNote[] {
  const hostIds = new Set(hostAttachments.map((a) => a.id));
  return state.notes.filter((n) => {
    if (n.origin !== 'local') {
      return false;
    }
    if (n.deletedAt != null) {
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

/** Linked notes newer than host — PATCH on sync. */
export function localNotesToUpdate(
  state: ClientBrainState,
  hostAttachments: readonly Attachment[]
): ClientBrainNote[] {
  const byId = new Map(hostAttachments.map((a) => [a.id, a]));
  return state.notes.filter((n) => {
    if (!n.gatewayAttachmentId) {
      return false;
    }
    if (n.deletedAt != null) {
      return false;
    }
    const host = byId.get(n.gatewayAttachmentId);
    if (!host || host.deletedAt != null) {
      return false;
    }
    return n.updatedAt > host.updatedAt;
  });
}

/** Local tombstones that still need host soft-delete. */
export function localNotesToDelete(
  state: ClientBrainState,
  hostAttachments: readonly Attachment[]
): ClientBrainNote[] {
  const byId = new Map(hostAttachments.map((a) => [a.id, a]));
  return state.notes.filter((n) => {
    if (!n.gatewayAttachmentId) {
      return false;
    }
    if (n.deletedAt == null) {
      return false;
    }
    const host = byId.get(n.gatewayAttachmentId);
    if (!host) {
      return false;
    }
    return host.deletedAt == null;
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
  updateAttachmentText: (
    attachmentId: string,
    input: { filename?: string; text: string; mimeType?: string }
  ) => Promise<Attachment>;
  deleteAttachment: (attachmentId: string) => Promise<Attachment>;
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
  updateMemory: (
    memoryId: string,
    input: UpdateMemoryInput
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
  BrainSyncOk<T> | BrainSyncFail<T>;

/**
 * Multi-conversation + knowledge sync with last-write-wins notes/memory.
 * - Pins workspace id (no `workspaces[0]` after first success).
 * - Each local thread maps to its own host conversation (never `conversations[0]` fallback).
 * - Host threads unknown locally are pulled into the brain.
 * - Notes / memory: create, edit (LWW), and delete (tombstones / archive).
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
    let hostMemory = await api.listMemory(workspaceId);
    const memBefore = next.memory.filter((m) => m.deletedAt == null).length;
    next = mergeGatewayMemory(next, hostMemory);
    const memAfter = next.memory.filter((m) => m.deletedAt == null).length;
    pulled += Math.max(0, memAfter - memBefore);

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

    const memoryUpdate = localMemoryToUpdate(next, hostMemory);
    for (const item of memoryUpdate) {
      if (!item.gatewayMemoryId) {
        continue;
      }
      await api.updateMemory(item.gatewayMemoryId, {
        content: item.content,
        kind: item.kind,
        status: item.status,
        pinned: item.pinned,
      });
      pushed += 1;
    }

    const memoryDelete = localMemoryToDelete(next, hostMemory);
    for (const item of memoryDelete) {
      if (!item.gatewayMemoryId) {
        continue;
      }
      await api.updateMemory(item.gatewayMemoryId, {
        status: 'archived',
        pinned: false,
      });
      pushed += 1;
    }

    // --- Notes / chunks sync ---
    let hostAttachments = await api.listAttachments(workspaceId);
    let hostChunks = await api.listChunks(workspaceId);
    const notesBefore = next.notes.filter((n) => n.deletedAt == null).length;
    const chunksBefore = next.chunks.length;
    next = mergeGatewayKnowledge(next, hostAttachments, hostChunks);
    const notesAfter = next.notes.filter((n) => n.deletedAt == null).length;
    pulled +=
      Math.max(0, notesAfter - notesBefore) +
      Math.max(0, next.chunks.length - chunksBefore);

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

    const notesUpdate = localNotesToUpdate(next, hostAttachments);
    for (const note of notesUpdate) {
      if (!note.gatewayAttachmentId) {
        continue;
      }
      await api.updateAttachmentText(note.gatewayAttachmentId, {
        filename: note.filename,
        text: note.text,
        mimeType: 'text/markdown',
      });
      pushed += 1;
    }

    const notesDelete = localNotesToDelete(next, hostAttachments);
    for (const note of notesDelete) {
      if (!note.gatewayAttachmentId) {
        continue;
      }
      await api.deleteAttachment(note.gatewayAttachmentId);
      pushed += 1;
    }

    if (
      notesPush.length > 0 ||
      notesUpdate.length > 0 ||
      notesDelete.length > 0 ||
      memoryPush.length > 0 ||
      memoryUpdate.length > 0 ||
      memoryDelete.length > 0
    ) {
      hostAttachments = await api.listAttachments(workspaceId);
      hostChunks = await api.listChunks(workspaceId);
      hostMemory = await api.listMemory(workspaceId);
      const n2 = next.notes.filter((n) => n.deletedAt == null).length;
      const c2 = next.chunks.length;
      next = mergeGatewayKnowledge(next, hostAttachments, hostChunks);
      next = mergeGatewayMemory(next, hostMemory);
      pulled +=
        Math.max(0, next.notes.filter((n) => n.deletedAt == null).length - n2) +
        Math.max(0, next.chunks.length - c2);
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
