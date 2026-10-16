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

export type BrainState = {
  version: 1;
  persona: string;
  generator: WebGeneratorMode;
  activeConversationId: string;
  conversations: BrainConversation[];
  messages: BrainMessage[];
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
    if (isBrainState(parsed)) {
      return Promise.resolve(parsed);
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
