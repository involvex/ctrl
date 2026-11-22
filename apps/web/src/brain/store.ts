import {
  migrateClientBrainState,
  type ClientBrainChunk,
  type ClientBrainMemory,
  type ClientBrainNote,
} from '@involvex/ctrl-i';
import type { WebGeneratorMode } from './generator';

export const BRAIN_STORAGE_KEY = 'ctrl.web.brain.v1';

export const DEFAULT_PERSONA =
  'You are ctrl. Be concise, practical, and stay in character across generators.';

export type BrainMessageOrigin = 'local' | 'gateway';

export type BrainMessage = {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: number;
  updatedAt: number;
  origin: BrainMessageOrigin;
};

export type BrainConversation = {
  id: string;
  title: string;
  gatewayConversationId?: string;
  updatedAt: number;
};

export type BrainNote = ClientBrainNote;
export type BrainMemory = ClientBrainMemory;
export type BrainChunk = ClientBrainChunk;

export type BrainState = {
  version: 2;
  persona: string;
  generator: WebGeneratorMode;
  activeConversationId: string;
  conversations: BrainConversation[];
  messages: BrainMessage[];
  notes: BrainNote[];
  memory: BrainMemory[];
  chunks: BrainChunk[];
  /** Pinned paired workspace after first successful sync. */
  gatewayWorkspaceId?: string;
};

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createEmptyBrain(
  generator: WebGeneratorMode = 'gateway'
): BrainState {
  const conversationId = newId('conv');
  const now = Date.now();
  return {
    version: 2,
    persona: DEFAULT_PERSONA,
    generator,
    activeConversationId: conversationId,
    conversations: [
      {
        id: conversationId,
        title: 'Chat',
        updatedAt: now,
      },
    ],
    messages: [],
    notes: [],
    memory: [],
    chunks: [],
  };
}

function isPersistedBrain(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const v = value as Record<string, unknown>;
  return (
    (v.version === 1 || v.version === 2) &&
    typeof v.persona === 'string' &&
    Array.isArray(v.conversations) &&
    Array.isArray(v.messages) &&
    typeof v.activeConversationId === 'string'
  );
}

export function loadBrain(): Promise<BrainState> {
  try {
    if (typeof localStorage === 'undefined') {
      return Promise.resolve(createEmptyBrain());
    }
    const raw = localStorage.getItem(BRAIN_STORAGE_KEY);
    if (!raw) {
      return Promise.resolve(createEmptyBrain());
    }
    const parsed: unknown = JSON.parse(raw);
    if (isPersistedBrain(parsed)) {
      const migrated = migrateClientBrainState(parsed);
      return Promise.resolve({
        ...migrated,
        generator: migrated.generator as WebGeneratorMode,
      });
    }
  } catch {
    // fall through
  }
  return Promise.resolve(createEmptyBrain());
}

export function saveBrain(state: BrainState): Promise<void> {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(BRAIN_STORAGE_KEY, JSON.stringify(state));
    }
  } catch {
    // best-effort
  }
  return Promise.resolve();
}

export function listActiveMessages(state: BrainState): BrainMessage[] {
  return state.messages
    .filter((m) => m.conversationId === state.activeConversationId)
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt);
}

export function appendLocalMessage(
  state: BrainState,
  input: {
    role: BrainMessage['role'];
    content: string;
    origin?: BrainMessageOrigin;
  }
): BrainState {
  const now = Date.now();
  const message: BrainMessage = {
    id: newId('msg'),
    conversationId: state.activeConversationId,
    role: input.role,
    content: input.content,
    createdAt: now,
    updatedAt: now,
    origin: input.origin ?? 'local',
  };
  const conversations = state.conversations.map((c) => {
    if (c.id !== state.activeConversationId) {
      return c;
    }
    return Object.assign({}, c, { updatedAt: now });
  });
  return {
    ...state,
    conversations,
    messages: [...state.messages, message],
  };
}

export function setBrainGenerator(
  state: BrainState,
  generator: WebGeneratorMode
): BrainState {
  return { ...state, generator };
}

export function setGatewayConversationId(
  state: BrainState,
  gatewayConversationId: string,
  localConversationId?: string
): BrainState {
  const targetId = localConversationId ?? state.activeConversationId;
  const conversations = state.conversations.map((c) => {
    if (c.id !== targetId) {
      return c;
    }
    return Object.assign({}, c, {
      gatewayConversationId,
      updatedAt: Date.now(),
    });
  });
  return { ...state, conversations };
}

export function setGatewayWorkspaceId(
  state: BrainState,
  gatewayWorkspaceId: string
): BrainState {
  if (state.gatewayWorkspaceId === gatewayWorkspaceId) {
    return state;
  }
  return { ...state, gatewayWorkspaceId };
}

export function activeConversation(
  state: BrainState
): BrainConversation | undefined {
  return state.conversations.find((c) => c.id === state.activeConversationId);
}

export function setBrainPersona(
  state: BrainState,
  persona: string
): BrainState {
  return { ...state, persona };
}

export function listConversations(state: BrainState): BrainConversation[] {
  return state.conversations.slice().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function createLocalConversation(
  state: BrainState,
  title = 'New chat'
): BrainState {
  const id = newId('conv');
  const now = Date.now();
  return {
    ...state,
    activeConversationId: id,
    conversations: [{ id, title, updatedAt: now }, ...state.conversations],
  };
}

export function switchConversation(
  state: BrainState,
  conversationId: string
): BrainState {
  if (!state.conversations.some((c) => c.id === conversationId)) {
    return state;
  }
  return { ...state, activeConversationId: conversationId };
}

export function renameConversation(
  state: BrainState,
  conversationId: string,
  title: string
): BrainState {
  const trimmed = title.trim() || 'Chat';
  return {
    ...state,
    conversations: state.conversations.map((c) => {
      if (c.id !== conversationId) {
        return c;
      }
      return { ...c, title: trimmed, updatedAt: Date.now() };
    }),
  };
}

export function deleteConversation(
  state: BrainState,
  conversationId: string
): BrainState {
  if (state.conversations.length <= 1) {
    return state;
  }
  const conversations = state.conversations.filter(
    (c) => c.id !== conversationId
  );
  const messages = state.messages.filter(
    (m) => m.conversationId !== conversationId
  );
  const activeConversationId =
    state.activeConversationId === conversationId
      ? (conversations[0]?.id ?? state.activeConversationId)
      : state.activeConversationId;
  return {
    ...state,
    conversations,
    messages,
    activeConversationId,
  };
}

export function maybeTitleFromFirstMessage(
  state: BrainState,
  userContent: string
): BrainState {
  const conv = activeConversation(state);
  if (!conv) {
    return state;
  }
  if (conv.title !== 'Chat' && conv.title !== 'New chat') {
    return state;
  }
  const userCount = state.messages.filter(
    (m) => m.conversationId === state.activeConversationId && m.role === 'user'
  ).length;
  if (userCount !== 1) {
    return state;
  }
  const title =
    userContent.trim().slice(0, 48).replace(/\s+/g, ' ') || 'New chat';
  return renameConversation(state, conv.id, title);
}
