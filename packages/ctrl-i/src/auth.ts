export type ClientAuth = {
  /** Bearer token for gateway LAN pairing. */
  token?: string | null;
};

let clientAuth: ClientAuth = {};

export function setClientAuth(auth: ClientAuth): void {
  clientAuth = { ...auth };
}

export function getClientAuth(): ClientAuth {
  return { ...clientAuth };
}

export function clearClientAuth(): void {
  clientAuth = {};
}

export function authHeaders(
  extra?: Record<string, string>
): Record<string, string> {
  const headers: Record<string, string> = { ...extra };
  if (clientAuth.token) {
    headers['Authorization'] = `Bearer ${clientAuth.token}`;
  }
  return headers;
}

/** Append `token` query param for WebSocket URLs (browsers cannot set WS headers). */
export function withAuthSearch(search: string): string {
  if (!clientAuth.token) {
    return search;
  }
  const params = new URLSearchParams(
    search.startsWith('?') ? search.slice(1) : search
  );
  params.set('token', clientAuth.token);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}
