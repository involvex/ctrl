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
