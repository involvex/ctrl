import { resolveMcpClientFromEnv } from '@involvex/ctrl-m';
import {
  createLlamaSidecarFromEnv,
  resolveProvider,
  type LlamaSidecar,
} from '@involvex/ctrl-r';
import {
  clientControlMessageSchema,
  createConversationInputSchema,
  createMessageInputSchema,
  createWorkspaceInputSchema,
  healthResponseSchema,
  workspaceExportSchema,
  type AgentEvent,
  type HealthResponse,
} from '@involvex/ctrl-s';
import {
  createApprovalGate,
  registerBuiltinTools,
  runAgentLoop,
  ToolRegistry,
} from '@involvex/ctrl-x';
import { openDatabase, Store } from '@involvex/ctrl-z';
import path from 'node:path';
import { gatewayTokenFromEnv, isAuthorized, isPublicPath } from './auth';
import { demoAgentEvents } from './mock-stream';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 7331;
const VERSION = '0.0.1';
const CHUNK_DELAY_MS = 40;

type SocketData =
  | { kind: 'demo' }
  | {
      kind: 'chat';
      conversationId: string;
      content: string;
      runId: string;
      abort: AbortController;
      approvals: ReturnType<typeof createApprovalGate>;
    };

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
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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

function resolveSandboxRoot(): string {
  if (process.env['CTRL_SANDBOX_ROOT']) {
    return process.env['CTRL_SANDBOX_ROOT'];
  }
  const dataDir =
    process.env['CTRL_DATA_DIR'] ?? path.join(process.cwd(), 'data');
  return path.join(dataDir, 'sandbox');
}

async function streamIterable(
  ws: {
    readyState: number;
    send: (data: string) => void;
  },
  events: AsyncIterable<AgentEvent> | Iterable<AgentEvent>,
  pace = false
): Promise<string> {
  let assembled = '';
  for await (const event of events) {
    if (ws.readyState !== 1) {
      return assembled;
    }
    ws.send(JSON.stringify(event));
    if (event.type === 'message.delta') {
      assembled += event.text;
    }
    if (pace) {
      await Bun.sleep(CHUNK_DELAY_MS);
    }
  }
  return assembled;
}

export async function startServer(): Promise<ReturnType<typeof Bun.serve>> {
  const host = process.env['HOST'] ?? DEFAULT_HOST;
  const port = Number(process.env['PORT'] ?? DEFAULT_PORT);
  const expectedToken = gatewayTokenFromEnv();
  const db = openDatabase(resolveDbPath());
  const store = new Store(db);

  let llama: LlamaSidecar | null = null;
  try {
    llama = createLlamaSidecarFromEnv();
    if (llama) {
      const { baseUrl } = await llama.start();
      process.env['CTRL_OPENAI_BASE_URL'] = baseUrl;
      process.env['CTRL_OPENAI_API_KEY'] =
        process.env['CTRL_OPENAI_API_KEY'] ??
        process.env['OPENAI_API_KEY'] ??
        'local';
      if (!process.env['CTRL_PROVIDER']) {
        process.env['CTRL_PROVIDER'] = 'openai';
      }
      process.stderr.write(`[ctrl-a] llama-server ${baseUrl}\n`);
    }
  } catch (err) {
    process.stderr.write(
      `[ctrl-a] llama-server failed: ${err instanceof Error ? err.message : String(err)}\n`
    );
    llama = null;
  }

  const provider = resolveProvider();
  const sandboxRoot = resolveSandboxRoot();
  const registry = new ToolRegistry();
  registerBuiltinTools(registry, sandboxRoot);
  const mcp = resolveMcpClientFromEnv();
  await mcp.connectConfigured();
  mcp.mountOn(registry);
  const profile = store.ensureDefaultProfile(registry.listNames());

  process.stderr.write(`[ctrl-a] provider ${provider.id}\n`);
  process.stderr.write(`[ctrl-a] tools ${registry.listNames().join(', ')}\n`);
  process.stderr.write(`[ctrl-a] sandbox ${sandboxRoot}\n`);
  process.stderr.write(
    `[ctrl-a] mcp ${
      mcp
        .listServers()
        .map((s) => s.id)
        .join(', ') || '(none)'
    }\n`
  );
  process.stderr.write(
    `[ctrl-a] auth ${expectedToken ? 'token-required' : 'open'}\n`
  );

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

      if (!isPublicPath(url.pathname) && !isAuthorized(req, expectedToken)) {
        return json(req, { error: 'unauthorized' }, 401);
      }

      if (req.method === 'GET' && url.pathname === '/api/v1/pairing') {
        return json(req, {
          required: Boolean(expectedToken),
          llama: llama?.getStatus() ?? { state: 'stopped' },
        });
      }

      if (req.method === 'GET' && url.pathname === '/api/v1/tools') {
        return json(req, { items: registry.list() });
      }

      if (req.method === 'GET' && url.pathname === '/api/v1/profiles') {
        return json(req, { items: store.listAgentProfiles() });
      }

      if (req.method === 'GET' && url.pathname === '/api/v1/audit') {
        const limit = Number(url.searchParams.get('limit') ?? 100);
        return json(req, { items: store.listAudit(limit) });
      }

      if (req.method === 'GET' && url.pathname === '/api/v1/mcp/servers') {
        return json(req, { items: mcp.listServers() });
      }

      if (req.method === 'GET' && url.pathname === '/api/v1/workspaces') {
        return json(req, { items: store.listWorkspaces() });
      }

      if (req.method === 'POST' && url.pathname === '/api/v1/workspaces') {
        const body: unknown = await req.json();
        const input = createWorkspaceInputSchema.parse(body);
        return json(req, store.createWorkspace(input.name), 201);
      }

      if (req.method === 'POST' && url.pathname === '/api/v1/import') {
        const body: unknown = await req.json();
        const dump = workspaceExportSchema.parse(body);
        return json(req, store.importWorkspace(dump), 201);
      }

      const exportMatch = /^\/api\/v1\/workspaces\/([^/]+)\/export$/.exec(
        url.pathname
      );
      if (exportMatch && req.method === 'GET') {
        const workspaceId = exportMatch[1]!;
        try {
          return json(req, store.exportWorkspace(workspaceId));
        } catch {
          return json(req, { error: 'workspace not found' }, 404);
        }
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
        const runId = `run_${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`;
        const upgraded = srv.upgrade(req, {
          data: {
            kind: 'chat',
            conversationId,
            content,
            runId,
            abort: new AbortController(),
            approvals: createApprovalGate(),
          },
        });
        if (upgraded) {
          return undefined;
        }
        return withCors(
          req,
          new Response('WebSocket upgrade failed', { status: 400 })
        );
      }

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
            await streamIterable(ws, demoAgentEvents(), true);
            ws.close(1000, 'demo complete');
          })();
          return;
        }

        if (ws.data.kind === 'chat') {
          const { conversationId, content, runId, abort, approvals } = ws.data;
          void (async () => {
            store.addMessage(conversationId, 'user', content);
            const conversation = store.getConversation(conversationId);
            store.appendAudit({
              workspaceId: conversation?.workspaceId,
              conversationId,
              runId,
              action: 'run.started',
            });

            const history = store.listMessages(conversationId).map((m) => ({
              role: m.role,
              content: m.content,
            }));

            let assembled = '';
            try {
              for await (const event of runAgentLoop(
                {
                  runId,
                  messages: history,
                  profile,
                  signal: abort.signal,
                },
                {
                  provider,
                  registry,
                  approvals,
                  sandboxRoot,
                }
              )) {
                if (ws.readyState !== 1) {
                  break;
                }
                ws.send(JSON.stringify(event));
                if (event.type === 'message.delta') {
                  assembled += event.text;
                }
                auditFromEvent(store, event, {
                  workspaceId: conversation?.workspaceId,
                  conversationId,
                  runId,
                });
              }
            } catch (err) {
              const failed: AgentEvent = {
                type: 'run.failed',
                error: {
                  message: err instanceof Error ? err.message : String(err),
                },
              };
              if (ws.readyState === 1) {
                ws.send(JSON.stringify(failed));
              }
              store.appendAudit({
                workspaceId: conversation?.workspaceId,
                conversationId,
                runId,
                action: 'run.failed',
                detail: failed.error,
              });
            }

            if (assembled.length > 0) {
              store.addMessage(conversationId, 'assistant', assembled);
            }
            ws.close(1000, 'run complete');
          })();
        }
      },
      message(ws, raw) {
        if (ws.data.kind !== 'chat') {
          return;
        }
        let parsed: unknown;
        try {
          parsed =
            typeof raw === 'string'
              ? JSON.parse(raw)
              : JSON.parse(new TextDecoder().decode(raw));
        } catch {
          return;
        }
        const msg = clientControlMessageSchema.safeParse(parsed);
        if (!msg.success) {
          return;
        }
        if (msg.data.type === 'run.cancel') {
          ws.data.abort.abort(msg.data.reason ?? 'client cancel');
          return;
        }
        if (msg.data.type === 'approval.resolve') {
          ws.data.approvals.resolve(msg.data.approvalId, msg.data.decision);
        }
      },
    },
  });

  process.stderr.write(
    `[ctrl-a] listening on http://${server.hostname}:${server.port}\n`
  );
  process.stderr.write(`[ctrl-a] db ${resolveDbPath()}\n`);

  return server;
}

function auditFromEvent(
  store: Store,
  event: AgentEvent,
  ctx: {
    workspaceId?: string;
    conversationId: string;
    runId: string;
  }
): void {
  switch (event.type) {
    case 'tool.requested':
      store.appendAudit({
        ...ctx,
        action: 'tool.requested',
        detail: event.call,
      });
      break;
    case 'tool.started':
      store.appendAudit({
        ...ctx,
        action: 'tool.started',
        detail: { callId: event.callId },
      });
      break;
    case 'tool.completed':
      store.appendAudit({
        ...ctx,
        action: 'tool.completed',
        detail: { callId: event.callId, result: event.result },
      });
      break;
    case 'approval.requested':
      store.appendAudit({
        ...ctx,
        action: 'approval.requested',
        detail: {
          approvalId: event.approvalId,
          call: event.call,
          risk: event.risk,
        },
      });
      break;
    case 'approval.resolved':
      store.appendAudit({
        ...ctx,
        action: 'approval.resolved',
        detail: {
          approvalId: event.approvalId,
          decision: event.decision,
        },
      });
      if (event.decision !== 'approved') {
        store.appendAudit({
          ...ctx,
          action: 'tool.denied',
          detail: {
            approvalId: event.approvalId,
            decision: event.decision,
          },
        });
      }
      break;
    case 'run.completed':
      store.appendAudit({
        ...ctx,
        action: 'run.completed',
        detail: { finishReason: event.finishReason },
      });
      break;
    case 'run.failed':
      store.appendAudit({
        ...ctx,
        action: 'run.failed',
        detail: event.error,
      });
      break;
    case 'run.cancelled':
      store.appendAudit({
        ...ctx,
        action: 'run.cancelled',
        detail: { reason: event.reason },
      });
      break;
    default:
      break;
  }
}

if (import.meta.main) {
  await startServer();
}
