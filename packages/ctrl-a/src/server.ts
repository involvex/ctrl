import {
  createConversationInputSchema,
  createMessageInputSchema,
  createWorkspaceInputSchema,
  healthResponseSchema,
  type HealthResponse,
} from '@involvex/ctrl-s';
import { openDatabase, Store } from '@involvex/ctrl-z';
import path from 'node:path';
import { demoAgentEvents, mockChatEvents } from './mock-stream';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 7331;
const VERSION = '0.0.1';
const CHUNK_DELAY_MS = 40;

type SocketData =
  { kind: 'demo' } | { kind: 'chat'; conversationId: string; content: string };

function healthPayload(): HealthResponse {
  return healthResponseSchema.parse({
    ok: true,
    version: VERSION,
    service: 'ctrl-a',
  });
}

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

function withCors(req: Request, res: Response): Response {
  const headers = new Headers(res.headers);
  const cors = corsHeaders(req);
  headers.set(
    'Access-Control-Allow-Origin',
    cors['Access-Control-Allow-Origin']!
  );
  headers.set(
    'Access-Control-Allow-Methods',
    cors['Access-Control-Allow-Methods']!
  );
  headers.set(
    'Access-Control-Allow-Headers',
    cors['Access-Control-Allow-Headers']!
  );
  headers.set('Vary', cors['Vary']!);
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

function json(req: Request, data: unknown, status = 200): Response {
  return withCors(req, Response.json(data, { status }));
}

function resolveDbPath(): string {
  if (process.env['CTRL_DB_PATH']) {
    return process.env['CTRL_DB_PATH'];
  }
  const dataDir =
    process.env['CTRL_DATA_DIR'] ?? path.join(process.cwd(), 'data');
  return path.join(dataDir, 'app.db');
}

async function streamEvents(
  ws: {
    readyState: number;
    send: (data: string) => void;
    close: (code?: number, reason?: string) => void;
  },
  events: Iterable<{ type: string; text?: string }>
): Promise<string> {
  let assembled = '';
  for (const event of events) {
    if (ws.readyState !== 1) {
      return assembled;
    }
    ws.send(JSON.stringify(event));
    if (event.type === 'message.delta' && typeof event.text === 'string') {
      assembled += event.text;
    }
    await Bun.sleep(CHUNK_DELAY_MS);
  }
  return assembled;
}

export function startServer(): ReturnType<typeof Bun.serve> {
  const host = process.env['HOST'] ?? DEFAULT_HOST;
  const port = Number(process.env['PORT'] ?? DEFAULT_PORT);
  const db = openDatabase(resolveDbPath());
  const store = new Store(db);

  const server = Bun.serve<SocketData>({
    hostname: host,
    port,
    async fetch(req, srv) {
      const url = new URL(req.url);

      if (req.method === 'OPTIONS') {
        return withCors(req, new Response(null, { status: 204 }));
      }

      if (req.method === 'GET' && url.pathname === '/healthz') {
        return json(req, healthPayload());
      }

      if (req.method === 'GET' && url.pathname === '/api/v1/workspaces') {
        return json(req, { items: store.listWorkspaces() });
      }

      if (req.method === 'POST' && url.pathname === '/api/v1/workspaces') {
        const body: unknown = await req.json();
        const input = createWorkspaceInputSchema.parse(body);
        return json(req, store.createWorkspace(input.name), 201);
      }

      const workspaceConversations =
        /^\/api\/v1\/workspaces\/([^/]+)\/conversations$/.exec(url.pathname);
      if (workspaceConversations) {
        const workspaceId = workspaceConversations[1]!;
        if (req.method === 'GET') {
          if (!store.getWorkspace(workspaceId)) {
            return json(req, { error: 'workspace not found' }, 404);
          }
          return json(req, {
            items: store.listConversations(workspaceId),
          });
        }
        if (req.method === 'POST') {
          const body: unknown = await req.json();
          const input = createConversationInputSchema.parse({
            ...(typeof body === 'object' && body !== null ? body : {}),
            workspaceId,
          });
          try {
            const conversation = store.createConversation(
              input.workspaceId,
              input.title ?? 'New chat'
            );
            return json(req, conversation, 201);
          } catch {
            return json(req, { error: 'workspace not found' }, 404);
          }
        }
      }

      const conversationMessages =
        /^\/api\/v1\/conversations\/([^/]+)\/messages$/.exec(url.pathname);
      if (conversationMessages && req.method === 'GET') {
        const conversationId = conversationMessages[1]!;
        if (!store.getConversation(conversationId)) {
          return json(req, { error: 'conversation not found' }, 404);
        }
        return json(req, { items: store.listMessages(conversationId) });
      }

      if (url.pathname === '/ws/v1/demo') {
        const upgraded = srv.upgrade(req, { data: { kind: 'demo' } });
        if (upgraded) {
          return undefined;
        }
        return withCors(
          req,
          new Response('WebSocket upgrade failed', { status: 400 })
        );
      }

      const chatWs = /^\/ws\/v1\/conversations\/([^/]+)\/runs$/.exec(
        url.pathname
      );
      if (chatWs && req.method === 'GET') {
        const conversationId = chatWs[1]!;
        const content = url.searchParams.get('content') ?? '';
        if (!content) {
          return json(req, { error: 'content query required' }, 400);
        }
        if (!store.getConversation(conversationId)) {
          return json(req, { error: 'conversation not found' }, 404);
        }
        const upgraded = srv.upgrade(req, {
          data: { kind: 'chat', conversationId, content },
        });
        if (upgraded) {
          return undefined;
        }
        return withCors(
          req,
          new Response('WebSocket upgrade failed', { status: 400 })
        );
      }

      // Also accept POST to create user message + return run info (clients may prefer WS only)
      const chatPost = /^\/api\/v1\/conversations\/([^/]+)\/runs$/.exec(
        url.pathname
      );
      if (chatPost && req.method === 'POST') {
        const conversationId = chatPost[1]!;
        const body: unknown = await req.json();
        const input = createMessageInputSchema.parse(body);
        if (input.role !== 'user') {
          return json(req, { error: 'role must be user' }, 400);
        }
        if (!store.getConversation(conversationId)) {
          return json(req, { error: 'conversation not found' }, 404);
        }
        return json(
          req,
          {
            wsPath: `/ws/v1/conversations/${conversationId}/runs?content=${encodeURIComponent(input.content)}`,
          },
          201
        );
      }

      return json(req, { error: 'Not Found' }, 404);
    },
    websocket: {
      open(ws) {
        if (ws.data.kind === 'demo') {
          void (async () => {
            await streamEvents(ws, demoAgentEvents());
            ws.close(1000, 'demo complete');
          })();
          return;
        }

        if (ws.data.kind === 'chat') {
          const { conversationId, content } = ws.data;
          void (async () => {
            store.addMessage(conversationId, 'user', content);
            const assembled = await streamEvents(ws, mockChatEvents(content));
            if (assembled.length > 0) {
              store.addMessage(conversationId, 'assistant', assembled);
            }
            ws.close(1000, 'run complete');
          })();
        }
      },
      message() {
        // Phase 1: server-push streams only
      },
    },
  });

  process.stderr.write(
    `[ctrl-a] listening on http://${server.hostname}:${server.port}\n`
  );
  process.stderr.write(`[ctrl-a] db ${resolveDbPath()}\n`);

  return server;
}

if (import.meta.main) {
  startServer();
}
