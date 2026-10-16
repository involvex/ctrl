import { ChannelManager } from '@involvex/ctrl-c';
import { assembleContextPreview, ingestAttachment } from '@involvex/ctrl-k';
import { resolveMcpClientFromEnv } from '@involvex/ctrl-m';
import {
  createLlamaSidecarFromEnv,
  createProviderRuntime,
  type LlamaSidecar,
} from '@involvex/ctrl-r';
import {
  clientControlMessageSchema,
  createAttachmentInputSchema,
  createBackupInputSchema,
  restoreBackupInputSchema,
  createChannelInputSchema,
  createConversationInputSchema,
  createMemoryInputSchema,
  createMessageInputSchema,
  upsertMessagesInputSchema,
  createWorkspaceInputSchema,
  healthResponseSchema,
  inboundWebhookSchema,
  knowledgeSearchInputSchema,
  sendChannelMessageInputSchema,
  updateMemoryInputSchema,
  updateProviderConfigInputSchema,
  upsertIdentityInputSchema,
  workspaceExportSchema,
  type AgentEvent,
  type CreateAttachmentInput,
  type HealthResponse,
} from '@involvex/ctrl-s';
import {
  createApprovalGate,
  registerBuiltinTools,
  runAgentLoop,
  ToolRegistry,
} from '@involvex/ctrl-x';
import {
  BackupStore,
  ChannelStore,
  KnowledgeStore,
  openDatabase,
  Store,
} from '@involvex/ctrl-z';
import path from 'node:path';
import { gatewayTokenFromEnv, isAuthorized, isPublicPath } from './auth';
import { listLanGatewayUrls } from './lan';
import { demoAgentEvents } from './mock-stream';

/** Bind all interfaces so Expo / LAN clients can reach the gateway. */
const DEFAULT_HOST = '0.0.0.0';
const DEFAULT_PORT = 7331;
const VERSION = '0.0.1';
const CHUNK_DELAY_MS = 40;

/**
 * Prefer CTRL_A_HOST. Only honor generic HOST when it is an explicit bind address —
 * Windows/dev shells often set HOST to the machine name or 127.0.0.1.
 */
function resolveListenHost(): string {
  if (process.env['CTRL_A_HOST']) {
    return process.env['CTRL_A_HOST'];
  }
  const host = process.env['HOST'];
  if (
    host === '0.0.0.0' ||
    host === '127.0.0.1' ||
    host === '::' ||
    host === '::1'
  ) {
    return host;
  }
  return DEFAULT_HOST;
}

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

function resolveDataDir(): string {
  if (process.env['CTRL_DATA_DIR']) {
    return process.env['CTRL_DATA_DIR'];
  }
  // `bun run --filter @involvex/ctrl-a` uses packages/ctrl-a as cwd — keep DB at repo root.
  const cwd = process.cwd();
  const normalized = cwd.replaceAll('\\', '/');
  if (normalized.endsWith('/packages/ctrl-a')) {
    return path.join(cwd, '..', '..', 'data');
  }
  return path.join(cwd, 'data');
}

function isAddrInUse(err: unknown): boolean {
  if (!err || typeof err !== 'object') {
    return false;
  }
  const code = 'code' in err ? String(err.code) : '';
  // Bun may omit code; only treat explicit EADDRINUSE (not every "Is port in use?" listen failure).
  return code === 'EADDRINUSE';
}

function resolveDbPath(): string {
  if (process.env['CTRL_DB_PATH']) {
    return process.env['CTRL_DB_PATH'];
  }
  return path.join(resolveDataDir(), 'app.db');
}

function resolveSandboxRoot(): string {
  if (process.env['CTRL_SANDBOX_ROOT']) {
    return process.env['CTRL_SANDBOX_ROOT'];
  }
  return path.join(resolveDataDir(), 'sandbox');
}

function decodeAttachmentBytes(
  input: CreateAttachmentInput
): Uint8Array | null {
  if (typeof input.text === 'string') {
    return new TextEncoder().encode(input.text);
  }
  if (
    typeof input.contentBase64 === 'string' &&
    input.contentBase64.length > 0
  ) {
    return Uint8Array.from(Buffer.from(input.contentBase64, 'base64'));
  }
  return null;
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

export type StartedGateway = {
  server: ReturnType<typeof Bun.serve>;
  shutdown: (reason?: string) => Promise<void>;
};

export async function startServer(): Promise<StartedGateway> {
  const host = resolveListenHost();
  const port = Number(
    process.env['PORT'] ?? process.env['CTRL_A_PORT'] ?? DEFAULT_PORT
  );
  const expectedToken = gatewayTokenFromEnv();
  const db = openDatabase(resolveDbPath());
  const store = new Store(db);
  const knowledge = new KnowledgeStore(db);
  const backups = new BackupStore(resolveDataDir(), store);
  const channels = new ChannelManager({ store: new ChannelStore(db) });
  channels.startWorker(750);

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

  const providerRuntime = createProviderRuntime(process.env, {
    dataDir: resolveDataDir(),
  });
  const sandboxRoot = resolveSandboxRoot();
  const registry = new ToolRegistry();
  registerBuiltinTools(registry, sandboxRoot);
  const mcp = resolveMcpClientFromEnv();
  await mcp.connectConfigured();
  mcp.mountOn(registry);
  const profile = store.ensureDefaultProfile(registry.listNames());

  process.stderr.write(
    `[ctrl-a] provider ${providerRuntime.getProvider().id}\n`
  );
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
  process.stderr.write(`[ctrl-a] db ${resolveDbPath()}\n`);

  let server: ReturnType<typeof Bun.serve<SocketData>>;
  try {
    server = Bun.serve<SocketData>({
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
            port,
            urls: listLanGatewayUrls(port),
            llama: llama?.getStatus() ?? { state: 'stopped' },
          });
        }

        if (req.method === 'GET' && url.pathname === '/api/v1/tools') {
          return json(req, { items: registry.list() });
        }

        if (req.method === 'GET' && url.pathname === '/api/v1/provider') {
          return json(req, providerRuntime.status());
        }

        if (req.method === 'PATCH' && url.pathname === '/api/v1/provider') {
          const body = updateProviderConfigInputSchema.parse(await req.json());
          const status = providerRuntime.update(body);
          process.stderr.write(
            `[ctrl-a] provider → ${providerRuntime.getProvider().id}\n`
          );
          return json(req, status);
        }

        const workspaceAttachments =
          /^\/api\/v1\/workspaces\/([^/]+)\/attachments$/.exec(url.pathname);
        if (workspaceAttachments) {
          const workspaceId = workspaceAttachments[1]!;
          if (!store.getWorkspace(workspaceId)) {
            return json(req, { error: 'workspace not found' }, 404);
          }
          if (req.method === 'GET') {
            return json(req, { items: knowledge.listAttachments(workspaceId) });
          }
          if (req.method === 'POST') {
            const body: unknown = await req.json();
            const input = createAttachmentInputSchema.parse(body);
            const bytes = decodeAttachmentBytes(input);
            if (!bytes) {
              return json(
                req,
                { error: 'text or contentBase64 required' },
                400
              );
            }
            const attachment = knowledge.createAttachment(
              workspaceId,
              input,
              bytes
            );
            ingestAttachment(knowledge, attachment);
            const ready = knowledge.getAttachment(attachment.id) ?? attachment;
            return json(req, ready, 201);
          }
        }

        const workspaceKnowledgeSearch =
          /^\/api\/v1\/workspaces\/([^/]+)\/knowledge\/search$/.exec(
            url.pathname
          );
        if (workspaceKnowledgeSearch && req.method === 'POST') {
          const workspaceId = workspaceKnowledgeSearch[1]!;
          if (!store.getWorkspace(workspaceId)) {
            return json(req, { error: 'workspace not found' }, 404);
          }
          const body: unknown = await req.json();
          const input = knowledgeSearchInputSchema.parse(body);
          return json(req, {
            items: knowledge.searchKnowledge(
              workspaceId,
              input.query,
              input.limit ?? 8
            ),
          });
        }

        const workspaceMemory = /^\/api\/v1\/workspaces\/([^/]+)\/memory$/.exec(
          url.pathname
        );
        if (workspaceMemory) {
          const workspaceId = workspaceMemory[1]!;
          if (!store.getWorkspace(workspaceId)) {
            return json(req, { error: 'workspace not found' }, 404);
          }
          if (req.method === 'GET') {
            const status = url.searchParams.get('status');
            return json(req, {
              items: knowledge.listMemory(
                workspaceId,
                status === 'active' ||
                  status === 'archived' ||
                  status === 'pending_review'
                  ? { status }
                  : undefined
              ),
            });
          }
          if (req.method === 'POST') {
            const body: unknown = await req.json();
            const input = createMemoryInputSchema.parse(body);
            return json(req, knowledge.createMemory(workspaceId, input), 201);
          }
        }

        const memoryItem = /^\/api\/v1\/memory\/([^/]+)$/.exec(url.pathname);
        if (memoryItem && req.method === 'PATCH') {
          const memoryId = memoryItem[1]!;
          const body: unknown = await req.json();
          const input = updateMemoryInputSchema.parse(body);
          const updated = knowledge.updateMemory(memoryId, input);
          if (!updated) {
            return json(req, { error: 'memory not found' }, 404);
          }
          return json(req, updated);
        }

        const workspaceContext =
          /^\/api\/v1\/workspaces\/([^/]+)\/context$/.exec(url.pathname);
        if (workspaceContext && req.method === 'GET') {
          const workspaceId = workspaceContext[1]!;
          if (!store.getWorkspace(workspaceId)) {
            return json(req, { error: 'workspace not found' }, 404);
          }
          const conversationId = url.searchParams.get('conversationId');
          const query = url.searchParams.get('q') ?? '';
          const recentMessages = conversationId
            ? store
                .listMessages(conversationId)
                .slice(-8)
                .map((m) => ({
                  role: m.role,
                  content: m.content,
                  createdAt: m.createdAt,
                }))
            : [];
          const pinnedMemory = knowledge.listPinnedMemory(workspaceId);
          const knowledgeHits =
            query.trim().length > 0
              ? knowledge.searchKnowledge(workspaceId, query, 6)
              : [];
          return json(
            req,
            assembleContextPreview({
              workspaceId,
              conversationId,
              recentMessages,
              pinnedMemory,
              knowledgeHits,
            })
          );
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

        if (req.method === 'GET' && url.pathname === '/api/v1/backups') {
          return json(req, { items: backups.list() });
        }

        if (req.method === 'POST' && url.pathname === '/api/v1/backups') {
          const body: unknown = await req.json().catch(() => ({}));
          try {
            const input = createBackupInputSchema.parse(body ?? {});
            return json(req, backups.create(input), 201);
          } catch (err) {
            return json(
              req,
              {
                error: err instanceof Error ? err.message : String(err),
              },
              400
            );
          }
        }

        const backupRestoreMatch =
          /^\/api\/v1\/backups\/([^/]+)\/restore$/.exec(url.pathname);
        if (backupRestoreMatch && req.method === 'POST') {
          const backupId = backupRestoreMatch[1]!;
          try {
            const body: unknown = await req.json().catch(() => ({}));
            const input = restoreBackupInputSchema.parse(body ?? {});
            const result = backups.restore(backupId, input);
            return json(req, {
              backupId: result.backupId,
              workspaceIds: result.workspaces.map((w) => w.id),
              items: result.workspaces,
            });
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            const status = message.includes('not found') ? 404 : 400;
            return json(req, { error: message }, status);
          }
        }

        const backupGetMatch = /^\/api\/v1\/backups\/([^/]+)$/.exec(
          url.pathname
        );
        if (backupGetMatch && req.method === 'GET') {
          const snap = backups.get(backupGetMatch[1]!);
          if (!snap) {
            return json(req, { error: 'backup not found' }, 404);
          }
          return json(req, snap);
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
        if (conversationMessages) {
          const conversationId = conversationMessages[1]!;
          if (!store.getConversation(conversationId)) {
            return json(req, { error: 'conversation not found' }, 404);
          }
          if (req.method === 'GET') {
            return json(req, { items: store.listMessages(conversationId) });
          }
          if (req.method === 'POST') {
            const body: unknown = await req.json();
            const input = upsertMessagesInputSchema.parse(body);
            const items = input.items.map((item) =>
              store.upsertMessage({
                id: item.id,
                conversationId,
                role: item.role,
                content: item.content,
                createdAt: item.createdAt,
              })
            );
            return json(req, { items }, 201);
          }
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

        const workspaceChannels =
          /^\/api\/v1\/workspaces\/([^/]+)\/channels$/.exec(url.pathname);
        if (workspaceChannels) {
          const workspaceId = workspaceChannels[1]!;
          if (!store.getWorkspace(workspaceId)) {
            return json(req, { error: 'workspace not found' }, 404);
          }
          if (req.method === 'GET') {
            return json(req, { items: channels.list(workspaceId) });
          }
          if (req.method === 'POST') {
            const body: unknown = await req.json();
            const input = createChannelInputSchema.parse(body);
            const created = await channels.create(workspaceId, input);
            return json(req, created, 201);
          }
        }

        const channelItem = /^\/api\/v1\/channels\/([^/]+)$/.exec(url.pathname);
        if (channelItem && req.method === 'GET') {
          const channelId = channelItem[1]!;
          const item = channels.get(channelId);
          if (!item) {
            return json(req, { error: 'channel not found' }, 404);
          }
          return json(req, item);
        }

        const channelStart = /^\/api\/v1\/channels\/([^/]+)\/start$/.exec(
          url.pathname
        );
        if (channelStart && req.method === 'POST') {
          try {
            return json(req, await channels.startChannel(channelStart[1]!));
          } catch (err) {
            return json(
              req,
              { error: err instanceof Error ? err.message : String(err) },
              400
            );
          }
        }

        const channelStop = /^\/api\/v1\/channels\/([^/]+)\/stop$/.exec(
          url.pathname
        );
        if (channelStop && req.method === 'POST') {
          try {
            return json(req, await channels.stopChannel(channelStop[1]!));
          } catch (err) {
            return json(
              req,
              { error: err instanceof Error ? err.message : String(err) },
              400
            );
          }
        }

        const channelSend = /^\/api\/v1\/channels\/([^/]+)\/send$/.exec(
          url.pathname
        );
        if (channelSend && req.method === 'POST') {
          const channelId = channelSend[1]!;
          const body: unknown = await req.json();
          const input = sendChannelMessageInputSchema.parse(body);
          try {
            const job = channels.enqueue(channelId, input);
            await channels.processOutbox();
            return json(
              req,
              channels.listOutbox(channelId).find((j) => j.id === job.id) ??
                job,
              201
            );
          } catch (err) {
            return json(
              req,
              { error: err instanceof Error ? err.message : String(err) },
              404
            );
          }
        }

        const channelMessages = /^\/api\/v1\/channels\/([^/]+)\/messages$/.exec(
          url.pathname
        );
        if (channelMessages && req.method === 'GET') {
          const channelId = channelMessages[1]!;
          if (!channels.get(channelId)) {
            return json(req, { error: 'channel not found' }, 404);
          }
          return json(req, { items: channels.listMessages(channelId) });
        }

        const channelOutbox = /^\/api\/v1\/channels\/([^/]+)\/outbox$/.exec(
          url.pathname
        );
        if (channelOutbox && req.method === 'GET') {
          const channelId = channelOutbox[1]!;
          if (!channels.get(channelId)) {
            return json(req, { error: 'channel not found' }, 404);
          }
          return json(req, { items: channels.listOutbox(channelId) });
        }

        const channelIdentities =
          /^\/api\/v1\/channels\/([^/]+)\/identities$/.exec(url.pathname);
        if (channelIdentities) {
          const channelId = channelIdentities[1]!;
          if (!channels.get(channelId)) {
            return json(req, { error: 'channel not found' }, 404);
          }
          if (req.method === 'GET') {
            return json(req, { items: channels.listIdentities(channelId) });
          }
          if (req.method === 'POST') {
            const body: unknown = await req.json();
            const input = upsertIdentityInputSchema.parse(body);
            return json(req, channels.upsertIdentity(channelId, input), 201);
          }
        }

        const hookMatch = /^\/hooks\/v1\/([^/]+)$/.exec(url.pathname);
        if (hookMatch && req.method === 'POST') {
          const channelId = hookMatch[1]!;
          const full = channels.getConfig(channelId);
          if (!full) {
            return json(req, { error: 'channel not found' }, 404);
          }
          const secret =
            typeof full.config['webhookSecret'] === 'string'
              ? full.config['webhookSecret']
              : null;
          if (secret) {
            const provided =
              req.headers.get('x-ctrl-webhook-secret') ??
              url.searchParams.get('secret');
            if (provided !== secret) {
              return json(req, { error: 'unauthorized' }, 401);
            }
          }
          const body: unknown = await req.json();
          const input = inboundWebhookSchema.parse(body);
          try {
            const message = await channels.handleInbound(channelId, input);
            return json(req, message, 201);
          } catch (err) {
            return json(
              req,
              { error: err instanceof Error ? err.message : String(err) },
              400
            );
          }
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
            const { conversationId, content, runId, abort, approvals } =
              ws.data;
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
                    provider: providerRuntime.getProvider(),
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
  } catch (err) {
    if (isAddrInUse(err)) {
      process.stderr.write(
        `[ctrl-a] port ${port} already in use on ${host}\n` +
          `[ctrl-a] stop the other gateway (desktop app, leftover bun, or prior br dev:gateway) or set PORT=…\n` +
          `[ctrl-a] Windows: Get-NetTCPConnection -LocalPort ${port} | % OwningProcess | Stop-Process -Force\n`
      );
      process.exit(1);
    }
    throw err;
  }

  const boundPort = Number(server.port);
  const lanUrls = listLanGatewayUrls(boundPort);
  process.stderr.write(`[ctrl-a] listening on http://${host}:${boundPort}\n`);
  if (host === '127.0.0.1' || host === '::1') {
    process.stderr.write(
      `[ctrl-a] warn: loopback only — use CTRL_A_HOST=0.0.0.0 for LAN/Expo\n`
    );
  }
  if (lanUrls.length > 0 && host !== '127.0.0.1' && host !== '::1') {
    process.stderr.write(`[ctrl-a] lan ${lanUrls.join(' ')}\n`);
  }
  process.stderr.write(`[ctrl-a] press Ctrl+C to stop\n`);

  let shuttingDown = false;
  const shutdown = async (reason = 'signal'): Promise<void> => {
    if (shuttingDown) {
      process.stderr.write(`[ctrl-a] force exit (second ${reason})\n`);
      process.exit(1);
    }
    shuttingDown = true;
    process.stderr.write(`[ctrl-a] shutting down (${reason})\n`);
    const forceTimer = setTimeout(() => {
      process.stderr.write(`[ctrl-a] force exit\n`);
      process.exit(1);
    }, 2500);
    try {
      channels.stopWorker();
      await mcp.close().catch(() => undefined);
      await llama?.stop().catch(() => undefined);
      await Promise.resolve(server.stop(true));
      db.close();
    } catch (err) {
      process.stderr.write(
        `[ctrl-a] shutdown error: ${err instanceof Error ? err.message : String(err)}\n`
      );
    } finally {
      clearTimeout(forceTimer);
      process.exit(0);
    }
  };

  return { server, shutdown };
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
  const { shutdown } = await startServer();
  const onSignal = (signal: string) => {
    void shutdown(signal);
  };
  process.on('SIGINT', () => onSignal('SIGINT'));
  process.on('SIGTERM', () => onSignal('SIGTERM'));
  // Windows Ctrl+Break / console close
  process.on('SIGBREAK', () => onSignal('SIGBREAK'));
  process.on('SIGHUP', () => onSignal('SIGHUP'));
}
