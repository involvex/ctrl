import type { Message } from '@involvex/ctrl-s';
import type { BrainMessage, BrainState } from './store';

function fingerprint(role: string, content: string): string {
  return `${role}\n${content}`;
}

export function mergeGatewayMessages(
  state: BrainState,
  conversationId: string,
  gatewayMessages: readonly Message[]
): BrainState {
  const existingIds = new Set(state.messages.map((m) => m.id));
  const existingFingerprints = new Set(
    state.messages
      .filter((m) => m.conversationId === conversationId)
      .map((m) => fingerprint(m.role, m.content))
  );

  const incoming: BrainMessage[] = [];
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

export function localMessagesToPush(
  state: BrainState,
  conversationId: string,
  gatewayMessages: readonly Message[]
): BrainMessage[] {
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
