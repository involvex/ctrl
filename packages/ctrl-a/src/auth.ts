/**
 * Gateway bearer-token auth for LAN pairing (Phase 3).
 * Disabled when CTRL_GATEWAY_TOKEN is unset (local contracts / mock).
 */

export function gatewayTokenFromEnv(
  env: NodeJS.Dict<string> = process.env
): string | null {
  const token = env['CTRL_GATEWAY_TOKEN']?.trim();
  return token && token.length > 0 ? token : null;
}

export function extractRequestToken(req: Request): string | null {
  const auth = req.headers.get('Authorization');
  if (auth?.toLowerCase().startsWith('bearer ')) {
    const value = auth.slice(7).trim();
    return value.length > 0 ? value : null;
  }
  const url = new URL(req.url);
  const fromQuery =
    url.searchParams.get('token') ?? url.searchParams.get('access_token');
  return fromQuery && fromQuery.length > 0 ? fromQuery : null;
}

export function isAuthorized(req: Request, expected: string | null): boolean {
  if (!expected) {
    return true;
  }
  const provided = extractRequestToken(req);
  return provided === expected;
}

/** Paths that remain public even when a gateway token is configured. */
export function isPublicPath(pathname: string): boolean {
  return (
    pathname === '/healthz' ||
    pathname === '/api/v1/pairing' ||
    pathname.startsWith('/hooks/v1/')
  );
}
