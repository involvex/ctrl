import {
  createConversation,
  createWorkspace,
  listConversations,
  listWorkspaces,
  setClientAuth,
  type Workspace,
} from '@involvex/ctrl-i';
import { loadSavedConnection } from './storage';

export type ConnectedWorkspace = {
  gatewayUrl: string;
  workspace: Workspace;
  conversationId: string | null;
};

export async function resolveConnectedWorkspace(): Promise<ConnectedWorkspace> {
  const saved = await loadSavedConnection();
  if (!saved) {
    throw new Error('not connected — set gateway on home first');
  }
  setClientAuth({ token: saved.token || undefined });
  const workspaces = await listWorkspaces(saved.gatewayUrl);
  let workspace = workspaces[0] ?? null;
  if (!workspace) {
    workspace = await createWorkspace(saved.gatewayUrl, 'Web');
  }
  const conversations = await listConversations(saved.gatewayUrl, workspace.id);
  let conversation = conversations[0] ?? null;
  if (!conversation) {
    conversation = await createConversation(
      saved.gatewayUrl,
      workspace.id,
      'Chat'
    );
  }
  return {
    gatewayUrl: saved.gatewayUrl,
    workspace,
    conversationId: conversation.id,
  };
}
