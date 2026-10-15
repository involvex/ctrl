import { healthResponseSchema, type HealthResponse } from '@involvex/ctrl-s';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 7331;
const VERSION = '0.0.1';

function healthPayload(): HealthResponse {
  return healthResponseSchema.parse({
    ok: true,
    version: VERSION,
    service: 'ctrl-a',
  });
}

export function startServer(): ReturnType<typeof Bun.serve> {
  const host = process.env['HOST'] ?? DEFAULT_HOST;
  const port = Number(process.env['PORT'] ?? DEFAULT_PORT);

  const server = Bun.serve({
    hostname: host,
    port,
    fetch(req) {
      const url = new URL(req.url);

      if (req.method === 'GET' && url.pathname === '/healthz') {
        return Response.json(healthPayload());
      }

      return new Response('Not Found', { status: 404 });
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
