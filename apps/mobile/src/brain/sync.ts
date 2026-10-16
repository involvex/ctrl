import {
  checkHealth,
  createConversation,
  createWorkspace,
  listConversations,
  listMessages,
  listWorkspaces,
  upsertMessages,
  setClientAuth,
} from '@involvex/ctrl-i';
import { loadSavedConnection } from '../connection/storage';
import { localMessagesToPush, mergeGatewayMessages } from './merge';
import {
  activeConversation,
  saveBrain,
  setGatewayConversationId,
  type BrainState,
} from './store';

export type SyncResult =
  | { ok: true; brain: BrainState; pushed: number; pulled: number }
  | { ok: false; reason: string; brain: BrainState };

/**
 * Append-only sync when the paired gateway answers /healthz.
 */
export async function syncBrainWithGateway(
  brain: BrainState
): Promise<SyncResult> {
  const saved = await loadSavedConnection();
  if (!saved) {
    return { ok: false, reason: 'not paired', brain };
  }
  setClientAuth({ token: saved.token || undefined });

  try {
    await checkHealth(saved.gatewayUrl);
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : 'PC offline',
      brain,
    };
  }

  try {
    const workspaces = await listWorkspaces(saved.gatewayUrl);
    let ws = workspaces[0] ?? null;
    if (!ws) {
      ws = await createWorkspace(saved.gatewayUrl, 'Mobile');
    }
    const conversations = await listConversations(saved.gatewayUrl, ws.id);
    const localConv = activeConversation(brain);
    let gatewayConversationId = localConv?.gatewayConversationId;
    let cv =
      (gatewayConversationId
        ? conversations.find((c) => c.id === gatewayConversationId)
        : null) ??
      conversations[0] ??
      null;
    if (!cv) {
      cv = await createConversation(saved.gatewayUrl, ws.id, 'Chat');
    }
    gatewayConversationId = cv.id;

    let next = setGatewayConversationId(brain, gatewayConversationId);
    const beforeCount = next.messages.length;
    const remote = await listMessages(saved.gatewayUrl, gatewayConversationId);
    next = mergeGatewayMessages(next, next.activeConversationId, remote);
    const pulled = next.messages.length - beforeCount;

    const toPush = localMessagesToPush(next, next.activeConversationId, remote);
    if (toPush.length > 0) {
      await upsertMessages(
        saved.gatewayUrl,
        gatewayConversationId,
        toPush.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          createdAt: m.createdAt,
        }))
      );
    }

    await saveBrain(next);
    return { ok: true, brain: next, pushed: toPush.length, pulled };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
      brain,
    };
  }
}
