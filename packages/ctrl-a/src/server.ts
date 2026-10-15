import { healthResponseSchema, type HealthResponse } from '@involvex/ctrl-s';
import { demoAgentEvents } from './mock-stream';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 7331;
const VERSION = '0.0.1';
const DEMO_CHUNK_DELAY_MS = 80;

type DemoSocketData = {
  kind: 'demo';
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
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
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

async function streamDemo(ws: {
  readyState: number;
  send: (data: string) => void;
  close: (code?: number, reason?: string) => void;
}): Promise<void> {
  for (const event of demoAgentEvents()) {
    if (ws.readyState !== 1) {
      return;
    }
    ws.send(JSON.stringify(event));
    await Bun.sleep(DEMO_CHUNK_DELAY_MS);
  }
  ws.close(1000, 'demo complete');
}

export function startServer(): ReturnType<typeof Bun.serve> {
  const host = process.env['HOST'] ?? DEFAULT_HOST;
  const port = Number(process.env['PORT'] ?? DEFAULT_PORT);

  const server = Bun.serve<DemoSocketData>({
    hostname: host,
    port,
    fetch(req, srv) {
      const url = new URL(req.url);

      if (req.method === 'OPTIONS') {
        return withCors(req, new Response(null, { status: 204 }));
      }

      if (req.method === 'GET' && url.pathname === '/healthz') {
        return withCors(req, Response.json(healthPayload()));
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

      return withCors(req, new Response('Not Found', { status: 404 }));
    },
    websocket: {
      open(ws) {
        if (ws.data.kind === 'demo') {
          void streamDemo(ws);
        }
      },
      message() {
        // Phase 0 demo is server-push only
      },
    },
  });

  process.stderr.write(
    `[ctrl-a] listening on http://${server.hostname}:${server.port}\n`
  );

  return server;
}

if (import.meta.main) {
  startServer();
}
