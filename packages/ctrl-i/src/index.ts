import {
  agentEventSchema,
  conversationSchema,
  healthResponseSchema,
  messageSchema,
  workspaceExportSchema,
  workspaceSchema,
  type AgentEvent,
  type Conversation,
  type HealthResponse,
  type Message,
  type Workspace,
  type WorkspaceExport,
} from '@involvex/ctrl-s';
import { z } from 'zod';

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, '');
}

export function toWsUrl(
  baseUrl: string,
  pathname: string,
  search?: string
): string {
  const base = new URL(normalizeBaseUrl(baseUrl));
  base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
  base.pathname = pathname;
  base.search = search ?? '';
  base.hash = '';
  return base.toString();
}

export async function checkHealth(baseUrl: string): Promise<HealthResponse> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/healthz`);
  if (!res.ok) {
    throw new Error(`healthz failed: ${res.status} ${res.statusText}`);
  }
  return healthResponseSchema.parse(await res.json());
}

async function readJson(res: Response): Promise<unknown> {
  return await res.json();
}

export async function listWorkspaces(baseUrl: string): Promise<Workspace[]> {
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/api/v1/workspaces`);
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
    headers: { 'Content-Type': 'application/json' },
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
    `${normalizeBaseUrl(baseUrl)}/api/v1/workspaces/${workspaceId}/conversations`
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
      headers: { 'Content-Type': 'application/json' },
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
    `${normalizeBaseUrl(baseUrl)}/api/v1/conversations/${conversationId}/messages`
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
    `${normalizeBaseUrl(baseUrl)}/api/v1/workspaces/${workspaceId}/export`
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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dump),
  });
  if (!res.ok) {
    throw new Error(`importWorkspace failed: ${res.status}`);
  }
  return workspaceSchema.parse(await readJson(res));
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

export type {
  AgentEvent,
  Conversation,
  HealthResponse,
  Message,
  Workspace,
  WorkspaceExport,
};
