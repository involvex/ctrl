import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GeneratorMode } from '../device/inference-mode';

export const BRAIN_STORAGE_KEY = 'ctrl.mobile.brain.v1';

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
  /** Which provider answered (cascade tag). */
  provider?: string;
};

export type BrainConversation = {
  id: string;
  title: string;
  gatewayConversationId?: string;
  updatedAt: number;
};

export type BrainState = {
  version: 1;
  persona: string;
  generator: GeneratorMode;
  activeConversationId: string;
  conversations: BrainConversation[];
  messages: BrainMessage[];
};

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createEmptyBrain(
  generator: GeneratorMode = 'litert'
): BrainState {
  const conversationId = newId('conv');
  const now = Date.now();
  return {
    version: 1,
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
  };
}

function isBrainState(value: unknown): value is BrainState {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const v = value as BrainState;
  return (
    v.version === 1 &&
    typeof v.persona === 'string' &&
    Array.isArray(v.conversations) &&
    Array.isArray(v.messages) &&
    typeof v.activeConversationId === 'string'
  );
}

export async function loadBrain(): Promise<BrainState> {
  try {
    const raw = await AsyncStorage.getItem(BRAIN_STORAGE_KEY);
    if (!raw) {
      return createEmptyBrain();
    }
    const parsed: unknown = JSON.parse(raw);
    if (isBrainState(parsed)) {
      return parsed;
    }
  } catch {
    // fall through
  }
  return createEmptyBrain();
}

export async function saveBrain(state: BrainState): Promise<void> {
  await AsyncStorage.setItem(BRAIN_STORAGE_KEY, JSON.stringify(state));
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
    provider?: string;
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
    provider: input.provider,
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
  generator: GeneratorMode
): BrainState {
  return { ...state, generator };
}

export function setBrainPersona(
  state: BrainState,
  persona: string
): BrainState {
  return { ...state, persona };
}

export function setGatewayConversationId(
  state: BrainState,
  gatewayConversationId: string
): BrainState {
  const conversations = state.conversations.map((c) => {
    if (c.id !== state.activeConversationId) {
      return c;
    }
    return Object.assign({}, c, {
      gatewayConversationId,
      updatedAt: Date.now(),
    });
  });
  return { ...state, conversations };
}

export function activeConversation(
  state: BrainState
): BrainConversation | undefined {
  return state.conversations.find((c) => c.id === state.activeConversationId);
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

/** Delete a conversation and its messages. Keeps at least one conversation. */
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

/** Set title from first user message when still the default placeholder. */
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
  // Caller should invoke after appendLocalMessage so count includes this turn.
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
