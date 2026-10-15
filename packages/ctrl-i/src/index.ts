import {
  agentEventSchema,
  healthResponseSchema,
  type AgentEvent,
  type HealthResponse,
} from '@involvex/ctrl-s';

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, '');
}

export function toWsUrl(baseUrl: string, path: string): string {
  const base = new URL(normalizeBaseUrl(baseUrl));
  base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
  base.pathname = path;
  base.search = '';
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

export type DemoStreamHandlers = {
  onEvent: (event: AgentEvent) => void;
  onError?: (error: Error) => void;
  onClose?: () => void;
};

/** Connect to Phase 0 mock demo stream (`/ws/v1/demo`). */
export function streamDemo(
  baseUrl: string,
  handlers: DemoStreamHandlers
): () => void {
  const ws = new WebSocket(toWsUrl(baseUrl, '/ws/v1/demo'));
  let closed = false;

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

  return () => {
    closed = true;
    ws.close();
  };
}
