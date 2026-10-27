import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GeneratorMode } from '../device/inference-mode';

export const PROVIDER_STACK_KEY = 'ctrl.mobile.providers.v1';

export type ProviderKind = 'litert' | 'gateway' | 'zen' | 'openai';

export type ProviderEntry = {
  id: string;
  label: string;
  kind: ProviderKind;
  enabled: boolean;
  baseUrl?: string;
  model?: string;
};

export type ProviderStack = {
  order: string[];
  entries: Record<string, ProviderEntry>;
};

export const DEFAULT_PROVIDER_STACK: ProviderStack = {
  order: ['zen', 'gateway', 'litert'],
  entries: {
    zen: {
      id: 'zen',
      label: 'Cloud (Zen / Kilo)',
      kind: 'zen',
      enabled: true,
    },
    gateway: {
      id: 'gateway',
      label: 'This PC',
      kind: 'gateway',
      enabled: true,
    },
    litert: {
      id: 'litert',
      label: 'On this phone',
      kind: 'litert',
      enabled: true,
    },
  },
};

function isStack(value: unknown): value is ProviderStack {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const v = value as ProviderStack;
  return (
    Array.isArray(v.order) &&
    Boolean(v.entries) &&
    typeof v.entries === 'object'
  );
}

export async function loadProviderStack(): Promise<ProviderStack> {
  try {
    const raw = await AsyncStorage.getItem(PROVIDER_STACK_KEY);
    if (!raw) {
      return structuredClone(DEFAULT_PROVIDER_STACK);
    }
    const parsed: unknown = JSON.parse(raw);
    if (isStack(parsed) && parsed.order.length > 0) {
      return parsed;
    }
  } catch {
    // fall through
  }
  return structuredClone(DEFAULT_PROVIDER_STACK);
}

export async function saveProviderStack(stack: ProviderStack): Promise<void> {
  await AsyncStorage.setItem(PROVIDER_STACK_KEY, JSON.stringify(stack));
}

export function enabledProviders(stack: ProviderStack): ProviderEntry[] {
  return stack.order
    .map((id) => stack.entries[id])
    .filter((e): e is ProviderEntry => Boolean(e?.enabled));
}

export function moveProvider(
  stack: ProviderStack,
  id: string,
  direction: 'up' | 'down'
): ProviderStack {
  const idx = stack.order.indexOf(id);
  if (idx < 0) {
    return stack;
  }
  const swapWith = direction === 'up' ? idx - 1 : idx + 1;
  if (swapWith < 0 || swapWith >= stack.order.length) {
    return stack;
  }
  return reorderProviders(stack, idx, swapWith);
}

/** Move the item at fromIndex to toIndex (0-based). */
export function reorderProviders(
  stack: ProviderStack,
  fromIndex: number,
  toIndex: number
): ProviderStack {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= stack.order.length ||
    toIndex >= stack.order.length
  ) {
    return stack;
  }
  const order = stack.order.slice();
  const [item] = order.splice(fromIndex, 1);
  if (!item) {
    return stack;
  }
  order.splice(toIndex, 0, item);
  return { ...stack, order };
}

export function setProviderEnabled(
  stack: ProviderStack,
  id: string,
  enabled: boolean
): ProviderStack {
  const entry = stack.entries[id];
  if (!entry) {
    return stack;
  }
  return {
    ...stack,
    entries: {
      ...stack.entries,
      [id]: { ...entry, enabled },
    },
  };
}

export function providerKindToGenerator(kind: ProviderKind): GeneratorMode {
  if (kind === 'litert') {
    return 'litert';
  }
  if (kind === 'zen' || kind === 'openai') {
    return 'zen';
  }
  return 'gateway';
}
