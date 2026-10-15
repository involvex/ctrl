import {
  agentEventSchema,
  attachmentSchema,
  channelIdentitySchema,
  channelMessageSchema,
  channelPublicSchema,
  contextInspectSchema,
  conversationSchema,
  createBackupInputSchema,
  healthResponseSchema,
  hostBackupManifestSchema,
  hostBackupSnapshotSchema,
  knowledgeHitSchema,
  memoryItemSchema,
  messageSchema,
  outboxJobSchema,
  workspaceExportSchema,
  workspaceSchema,
  type AgentEvent,
  type Attachment,
  type ChannelIdentity,
  type ChannelKind,
  type ChannelMessage,
  type ChannelPublic,
  type ContextInspect,
  type Conversation,
  type CreateBackupInput,
  type HealthResponse,
  type HostBackupManifest,
  type HostBackupSnapshot,
  type KnowledgeHit,
  type MemoryItem,
  type MemoryStatus,
  type Message,
  type OutboxJob,
  type Workspace,
  type WorkspaceExport,
} from '@involvex/ctrl-s';
import { z } from 'zod';
import { authHeaders, withAuthSearch } from './auth';

export {
  authHeaders,
  clearClientAuth,
  getClientAuth,
  setClientAuth,
  withAuthSearch,
  type ClientAuth,
} from './auth';

export type {
  CreateBackupInput,
  HostBackupManifest,
  HostBackupSnapshot,
} from '@involvex/ctrl-s';

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, '');
}

export function toWsUrl(
  baseUrl: string,
  pathname: string,
  search?: string
): string {
  const http = new URL(normalizeBaseUrl(baseUrl));
  const protocol = http.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new URL(`${protocol}//${http.host}`);
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${ws.origin}${path}${withAuthSearch(search ?? '')}`;
}

export async function checkHealth(baseUrl: string): Promise<HealthResponse> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/healthz`);
  if (!res.ok) {
    throw new Error(`healthz failed: ${res.status} ${res.statusText}`);
  }
  return healthResponseSchema.parse(await res.json());
}

const pairingStatusSchema = z.object({
  required: z.boolean(),
  llama: z
    .object({
      state: z.string(),
    })
    .passthrough()
    .optional(),
});

export type PairingStatus = z.infer<typeof pairingStatusSchema>;

/** Public pairing probe — reports whether bearer auth is required. */
export async function getPairingStatus(
  baseUrl: string
): Promise<PairingStatus> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/api/v1/pairing`);
  if (!res.ok) {
    throw new Error(`pairing failed: ${res.status} ${res.statusText}`);
  }
  return pairingStatusSchema.parse(await res.json());
}

async function readJson(res: Response): Promise<unknown> {
  return await res.json();
}

export async function listWorkspaces(baseUrl: string): Promise<Workspace[]> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/api/v1/workspaces`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    throw new Error(`listWorkspaces failed: ${res.status}`);
  }
  const body = z
    .object({ items: z.array(workspaceSchema) })
    .parse(await readJson(res));
  return body.items;
}

export async function createWorkspace(
  baseUrl: string,
  name: string
): Promise<Workspace> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/api/v1/workspaces`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    throw new Error(`createWorkspace failed: ${res.status}`);
  }
  return workspaceSchema.parse(await readJson(res));
}

export async function listConversations(
  baseUrl: string,
  workspaceId: string
): Promise<Conversation[]> {
  const res = await fetch(
    `${normalizeBaseUrl(baseUrl)}/api/v1/workspaces/${workspaceId}/conversations`,
    { headers: authHeaders() }
  );
  if (!res.ok) {
    throw new Error(`listConversations failed: ${res.status}`);
  }
  const body = z
    .object({ items: z.array(conversationSchema) })
    .parse(await readJson(res));
  return body.items;
}

export async function createConversation(
  baseUrl: string,
  workspaceId: string,
  title?: string
): Promise<Conversation> {
  const res = await fetch(
    `${normalizeBaseUrl(baseUrl)}/api/v1/workspaces/${workspaceId}/conversations`,
    {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ title }),
    }
  );
  if (!res.ok) {
    throw new Error(`createConversation failed: ${res.status}`);
  }
  return conversationSchema.parse(await readJson(res));
}

export async function listMessages(
  baseUrl: string,
  conversationId: string
): Promise<Message[]> {
  const res = await fetch(
    `${normalizeBaseUrl(baseUrl)}/api/v1/conversations/${conversationId}/messages`,
    { headers: authHeaders() }
  );
  if (!res.ok) {
    throw new Error(`listMessages failed: ${res.status}`);
  }
  const body = z
    .object({ items: z.array(messageSchema) })
    .parse(await readJson(res));
  return body.items;
}

export async function exportWorkspace(
  baseUrl: string,
  workspaceId: string
): Promise<WorkspaceExport> {
  const res = await fetch(
    `${normalizeBaseUrl(baseUrl)}/api/v1/workspaces/${workspaceId}/export`,
    { headers: authHeaders() }
  );
  if (!res.ok) {
    throw new Error(`exportWorkspace failed: ${res.status}`);
  }
  return workspaceExportSchema.parse(await readJson(res));
}

export async function importWorkspace(
  baseUrl: string,
  dump: WorkspaceExport
): Promise<Workspace> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/api/v1/import`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(dump),
  });
  if (!res.ok) {
    throw new Error(`importWorkspace failed: ${res.status}`);
  }
  return workspaceSchema.parse(await readJson(res));
}

export async function listBackups(
  baseUrl: string
): Promise<HostBackupManifest[]> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/api/v1/backups`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    throw new Error(`listBackups failed: ${res.status}`);
  }
  return z
    .object({ items: z.array(hostBackupManifestSchema) })
    .parse(await readJson(res)).items;
}

export async function createBackup(
  baseUrl: string,
  input: CreateBackupInput = {}
): Promise<HostBackupManifest> {
  const body = createBackupInputSchema.parse(input);
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/api/v1/backups`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`createBackup failed: ${res.status}`);
  }
  return hostBackupManifestSchema.parse(await readJson(res));
}

export async function getBackup(
  baseUrl: string,
  backupId: string
): Promise<HostBackupSnapshot> {
  const res = await fetch(
    `${normalizeBaseUrl(baseUrl)}/api/v1/backups/${backupId}`,
    { headers: authHeaders() }
  );
  if (!res.ok) {
    throw new Error(`getBackup failed: ${res.status}`);
  }
  return hostBackupSnapshotSchema.parse(await readJson(res));
}

export async function restoreBackup(
  baseUrl: string,
  backupId: string
): Promise<{ backupId: string; workspaceIds: string[]; items: Workspace[] }> {
  const res = await fetch(
    `${normalizeBaseUrl(baseUrl)}/api/v1/backups/${backupId}/restore`,
    {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: '{}',
    }
  );
  if (!res.ok) {
    throw new Error(`restoreBackup failed: ${res.status}`);
  }
  return z
    .object({
      backupId: z.string(),
      workspaceIds: z.array(z.string()),
      items: z.array(workspaceSchema),
    })
    .parse(await readJson(res));
}

export type StreamHandlers = {
  onEvent: (event: AgentEvent) => void;
  onError?: (error: Error) => void;
  onClose?: () => void;
};

export type RunSession = {
  /** Abort the active run (sends run.cancel to the gateway). */
  cancel: (reason?: string) => void;
  /** Approve or deny a pending tool approval. */
  resolveApproval: (
    approvalId: string,
    decision: 'approved' | 'denied'
  ) => void;
  /** Close the socket without a cancel message. */
  close: () => void;
};

function attachWs(url: string, handlers: StreamHandlers): RunSession {
  const ws = new WebSocket(url);
  let closed = false;

  const send = (payload: unknown) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  };

  ws.addEventListener('message', (msg) => {
    try {
      const raw: unknown =
        typeof msg.data === 'string' ? JSON.parse(msg.data) : msg.data;
      handlers.onEvent(agentEventSchema.parse(raw));
    } catch (err) {
      handlers.onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  });

  ws.addEventListener('error', () => {
    handlers.onError?.(new Error('WebSocket error'));
  });

  ws.addEventListener('close', () => {
    if (!closed) {
      handlers.onClose?.();
    }
  });

  return {
    cancel(reason) {
      send({ type: 'run.cancel', reason });
      closed = true;
      ws.close();
    },
    resolveApproval(approvalId, decision) {
      send({ type: 'approval.resolve', approvalId, decision });
    },
    close() {
      closed = true;
      ws.close();
    },
  };
}

/** Connect to Phase 0 mock demo stream (`/ws/v1/demo`). */
export function streamDemo(
  baseUrl: string,
  handlers: StreamHandlers
): RunSession {
  return attachWs(toWsUrl(baseUrl, '/ws/v1/demo'), handlers);
}

/** Stream a chat/agent run for a conversation. */
export function streamChat(
  baseUrl: string,
  conversationId: string,
  content: string,
  handlers: StreamHandlers
): RunSession {
  const search = `?content=${encodeURIComponent(content)}`;
  return attachWs(
    toWsUrl(baseUrl, `/ws/v1/conversations/${conversationId}/runs`, search),
    handlers
  );
}

export async function listAttachments(
  baseUrl: string,
  workspaceId: string
): Promise<Attachment[]> {
  const res = await fetch(
    `${normalizeBaseUrl(baseUrl)}/api/v1/workspaces/${workspaceId}/attachments`,
    { headers: authHeaders() }
  );
  if (!res.ok) {
    throw new Error(`listAttachments failed: ${res.status}`);
  }
  return z
    .object({ items: z.array(attachmentSchema) })
    .parse(await readJson(res)).items;
}

export async function uploadAttachmentText(
  baseUrl: string,
  workspaceId: string,
  input: {
    filename: string;
    text: string;
    mimeType?: string;
    conversationId?: string;
  }
): Promise<Attachment> {
  const res = await fetch(
    `${normalizeBaseUrl(baseUrl)}/api/v1/workspaces/${workspaceId}/attachments`,
    {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(input),
    }
  );
  if (!res.ok) {
    throw new Error(`uploadAttachment failed: ${res.status}`);
  }
  return attachmentSchema.parse(await readJson(res));
}

export async function searchKnowledge(
  baseUrl: string,
  workspaceId: string,
  query: string,
  limit?: number
): Promise<KnowledgeHit[]> {
  const res = await fetch(
    `${normalizeBaseUrl(baseUrl)}/api/v1/workspaces/${workspaceId}/knowledge/search`,
    {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ query, limit }),
    }
  );
  if (!res.ok) {
    throw new Error(`searchKnowledge failed: ${res.status}`);
  }
  return z
    .object({ items: z.array(knowledgeHitSchema) })
    .parse(await readJson(res)).items;
}

export async function listMemory(
  baseUrl: string,
  workspaceId: string,
  status?: MemoryStatus
): Promise<MemoryItem[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  const res = await fetch(
    `${normalizeBaseUrl(baseUrl)}/api/v1/workspaces/${workspaceId}/memory${qs}`,
    { headers: authHeaders() }
  );
  if (!res.ok) {
    throw new Error(`listMemory failed: ${res.status}`);
  }
  return z
    .object({ items: z.array(memoryItemSchema) })
    .parse(await readJson(res)).items;
}

export async function createMemory(
  baseUrl: string,
  workspaceId: string,
  input: {
    content: string;
    kind?: MemoryItem['kind'];
    status?: MemoryStatus;
    pinned?: boolean;
  }
): Promise<MemoryItem> {
  const res = await fetch(
    `${normalizeBaseUrl(baseUrl)}/api/v1/workspaces/${workspaceId}/memory`,
    {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(input),
    }
  );
  if (!res.ok) {
    throw new Error(`createMemory failed: ${res.status}`);
  }
  return memoryItemSchema.parse(await readJson(res));
}

export async function updateMemory(
  baseUrl: string,
  memoryId: string,
  input: {
    content?: string;
    kind?: MemoryItem['kind'];
    status?: MemoryStatus;
    pinned?: boolean;
  }
): Promise<MemoryItem> {
  const res = await fetch(
    `${normalizeBaseUrl(baseUrl)}/api/v1/memory/${memoryId}`,
    {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(input),
    }
  );
  if (!res.ok) {
    throw new Error(`updateMemory failed: ${res.status}`);
  }
  return memoryItemSchema.parse(await readJson(res));
}

export async function inspectContext(
  baseUrl: string,
  workspaceId: string,
  opts?: { conversationId?: string; q?: string }
): Promise<ContextInspect> {
  const params = new URLSearchParams();
  if (opts?.conversationId) {
    params.set('conversationId', opts.conversationId);
  }
  if (opts?.q) {
    params.set('q', opts.q);
  }
  const qs = params.toString();
  const res = await fetch(
    `${normalizeBaseUrl(baseUrl)}/api/v1/workspaces/${workspaceId}/context${qs ? `?${qs}` : ''}`,
    { headers: authHeaders() }
  );
  if (!res.ok) {
    throw new Error(`inspectContext failed: ${res.status}`);
  }
  return contextInspectSchema.parse(await readJson(res));
}

export async function listChannels(
  baseUrl: string,
  workspaceId: string
): Promise<ChannelPublic[]> {
  const res = await fetch(
    `${normalizeBaseUrl(baseUrl)}/api/v1/workspaces/${workspaceId}/channels`,
    { headers: authHeaders() }
  );
  if (!res.ok) {
    throw new Error(`listChannels failed: ${res.status}`);
  }
  return z
    .object({ items: z.array(channelPublicSchema) })
    .parse(await readJson(res)).items;
}

export async function createChannel(
  baseUrl: string,
  workspaceId: string,
  input: { kind: ChannelKind; name: string; config?: Record<string, unknown> }
): Promise<ChannelPublic> {
  const res = await fetch(
    `${normalizeBaseUrl(baseUrl)}/api/v1/workspaces/${workspaceId}/channels`,
    {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(input),
    }
  );
  if (!res.ok) {
    throw new Error(`createChannel failed: ${res.status}`);
  }
  return channelPublicSchema.parse(await readJson(res));
}

export async function sendChannelMessage(
  baseUrl: string,
  channelId: string,
  input: { externalUserId: string; text: string }
): Promise<OutboxJob> {
  const res = await fetch(
    `${normalizeBaseUrl(baseUrl)}/api/v1/channels/${channelId}/send`,
    {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(input),
    }
  );
  if (!res.ok) {
    throw new Error(`sendChannelMessage failed: ${res.status}`);
  }
  return outboxJobSchema.parse(await readJson(res));
}

export async function postChannelWebhook(
  baseUrl: string,
  channelId: string,
  input: { externalUserId: string; text: string; displayName?: string },
  secret?: string
): Promise<ChannelMessage> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (secret) {
    headers['x-ctrl-webhook-secret'] = secret;
  }
  const res = await fetch(
    `${normalizeBaseUrl(baseUrl)}/hooks/v1/${channelId}`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    }
  );
  if (!res.ok) {
    throw new Error(`postChannelWebhook failed: ${res.status}`);
  }
  return channelMessageSchema.parse(await readJson(res));
}

export async function listChannelIdentities(
  baseUrl: string,
  channelId: string
): Promise<ChannelIdentity[]> {
  const res = await fetch(
    `${normalizeBaseUrl(baseUrl)}/api/v1/channels/${channelId}/identities`,
    { headers: authHeaders() }
  );
  if (!res.ok) {
    throw new Error(`listChannelIdentities failed: ${res.status}`);
  }
  return z
    .object({ items: z.array(channelIdentitySchema) })
    .parse(await readJson(res)).items;
}

export type {
  AgentEvent,
  Attachment,
  ChannelIdentity,
  ChannelKind,
  ChannelMessage,
  ChannelPublic,
  ContextInspect,
  Conversation,
  HealthResponse,
  KnowledgeHit,
  MemoryItem,
  MemoryStatus,
  Message,
  OutboxJob,
  Workspace,
  WorkspaceExport,
};
