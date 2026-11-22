import type { Conversation, Message } from '@involvex/ctrl-s';

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

/**
 * Minimal brain shape for append-only sync.
 * Clients may carry extra fields (generator union, etc.).
 */
export type ClientBrainState = {
  version: 1;
  persona: string;
  generator: string;
  activeConversationId: string;
  conversations: ClientBrainConversation[];
  messages: ClientBrainMessage[];
  /** Pinned paired workspace — set after first successful sync. */
  gatewayWorkspaceId?: string;
};

function fingerprint(role: string, content: string): string {
  return `${role}\n${content}`;
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
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
 * Multi-conversation append-only sync.
 * - Pins workspace id (no `workspaces[0]` after first success).
 * - Each local thread maps to its own host conversation (never `conversations[0]` fallback).
 * - Host threads unknown locally are pulled into the brain.
 */
export async function syncClientBrain<T extends ClientBrainState>(
  brain: T,
  api: BrainSyncApi,
  opts: { workspaceName: string }
): Promise<BrainSyncResult<T>> {
  try {
    let next = brain;
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

    return { ok: true, brain: next, pushed, pulled };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
      brain,
    };
  }
}
