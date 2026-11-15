import type {
  AdapterInboundHandler,
  ChannelAdapter,
  InboundDraft,
} from '../types';

const DISCORD_API = 'https://discord.com/api/v10';

/** Guilds + GuildMessages + DirectMessages + MessageContent */
const GATEWAY_INTENTS = (1 << 0) | (1 << 9) | (1 << 12) | (1 << 15);

type DiscordSession = {
  abort: AbortController;
  loop: Promise<void>;
};

const sessions = new Map<string, DiscordSession>();

function botToken(channel: {
  config: Record<string, unknown>;
}): string | undefined {
  const fromToken =
    typeof channel.config['botToken'] === 'string'
      ? channel.config['botToken']
      : typeof channel.config['token'] === 'string'
        ? channel.config['token']
        : undefined;
  return fromToken || undefined;
}

function webhookUrl(channel: {
  config: Record<string, unknown>;
}): string | undefined {
  const fromWebhook =
    typeof channel.config['webhookUrl'] === 'string'
      ? channel.config['webhookUrl']
      : undefined;
  const fromUrl =
    typeof channel.config['url'] === 'string'
      ? channel.config['url']
      : undefined;
  return fromWebhook || fromUrl || undefined;
}

type DiscordAuthor = {
  id?: string;
  username?: string;
  global_name?: string | null;
  bot?: boolean;
};

type DiscordMessageCreate = {
  id?: string;
  content?: string;
  channel_id?: string;
  author?: DiscordAuthor;
  webhook_id?: string;
};

type GatewayPayload = {
  op: number;
  d?: unknown;
  s?: number | null;
  t?: string | null;
};

/** Map a MESSAGE_CREATE payload to an inbound draft (or null to skip). */
export function discordMessageToDraft(
  message: DiscordMessageCreate
): InboundDraft | null {
  if (message.webhook_id) {
    return null;
  }
  if (message.author?.bot) {
    return null;
  }
  const text = message.content?.trim();
  const channelId = message.channel_id;
  if (!text || !channelId) {
    return null;
  }
  const draft: InboundDraft = {
    externalUserId: channelId,
    text,
  };
  const name =
    message.author?.global_name?.trim() ||
    message.author?.username?.trim() ||
    undefined;
  if (name) {
    draft.displayName = name;
  }
  return draft;
}

async function fetchGatewayUrl(
  token: string,
  signal?: AbortSignal
): Promise<string> {
  const res = await fetch(`${DISCORD_API}/gateway/bot`, {
    headers: { Authorization: `Bot ${token}` },
    signal,
  });
  const raw: unknown = await res.json().catch(() => null);
  if (!res.ok || !raw || typeof raw !== 'object') {
    const messageField =
      raw &&
      typeof raw === 'object' &&
      'message' in raw &&
      typeof (raw as { message?: unknown }).message === 'string'
        ? (raw as { message: string }).message
        : '';
    throw new Error(
      `discord: gateway/bot failed (${res.status})${messageField ? `: ${messageField}` : ''}`
    );
  }
  const url = (raw as { url?: unknown }).url;
  if (typeof url !== 'string' || url.length === 0) {
    throw new Error('discord: gateway/bot missing url');
  }
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}v=10&encoding=json`;
}

function parsePayload(raw: string): GatewayPayload | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    const record = parsed as Record<string, unknown>;
    if (typeof record['op'] !== 'number') {
      return null;
    }
    const payload: GatewayPayload = { op: record['op'] };
    if ('d' in record) {
      payload.d = record['d'];
    }
    if (typeof record['s'] === 'number' || record['s'] === null) {
      payload.s = record['s'] as number | null;
    }
    if (typeof record['t'] === 'string' || record['t'] === null) {
      payload.t = record['t'] as string | null;
    }
    return payload;
  } catch {
    return null;
  }
}

async function runGateway(
  token: string,
  session: DiscordSession,
  onInbound: AdapterInboundHandler
): Promise<void> {
  while (!session.abort.signal.aborted) {
    let ws: WebSocket | null = null;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    let sequence: number | null = null;

    const clearHeartbeat = () => {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
    };

    try {
      const gatewayUrl = await fetchGatewayUrl(token, session.abort.signal);
      if (session.abort.signal.aborted) {
        return;
      }

      ws = new WebSocket(gatewayUrl);

      await new Promise<void>((resolve, reject) => {
        if (!ws) {
          reject(new Error('discord: websocket missing'));
          return;
        }
        const onAbort = () => {
          try {
            ws?.close();
          } catch {
            // ignore
          }
          reject(new Error('AbortError'));
        };
        if (session.abort.signal.aborted) {
          onAbort();
          return;
        }
        session.abort.signal.addEventListener('abort', onAbort, { once: true });
        ws.addEventListener('open', () => resolve(), { once: true });
        ws.addEventListener(
          'error',
          () => reject(new Error('discord: websocket error')),
          { once: true }
        );
      });

      await new Promise<void>((resolve, reject) => {
        if (!ws) {
          reject(new Error('discord: websocket missing'));
          return;
        }

        const fail = (err: Error) => {
          clearHeartbeat();
          reject(err);
        };

        const onAbort = () => {
          try {
            ws?.close();
          } catch {
            // ignore
          }
          fail(new Error('AbortError'));
        };
        session.abort.signal.addEventListener('abort', onAbort);

        ws.addEventListener('close', () => {
          session.abort.signal.removeEventListener('abort', onAbort);
          clearHeartbeat();
          resolve();
        });

        ws.addEventListener('error', () => {
          // close handler will settle
        });

        ws.addEventListener('message', (event) => {
          const data =
            typeof event.data === 'string'
              ? event.data
              : event.data instanceof ArrayBuffer
                ? new TextDecoder().decode(event.data)
                : String(event.data);
          const payload = parsePayload(data);
          if (!payload) {
            return;
          }
          if (typeof payload.s === 'number') {
            sequence = payload.s;
          }

          if (payload.op === 10) {
            const hello =
              payload.d && typeof payload.d === 'object'
                ? (payload.d as Record<string, unknown>)
                : null;
            const interval =
              hello && typeof hello['heartbeat_interval'] === 'number'
                ? hello['heartbeat_interval']
                : 41_250;
            clearHeartbeat();
            const sendHeartbeat = () => {
              if (!ws || ws.readyState !== WebSocket.OPEN) {
                return;
              }
              ws.send(JSON.stringify({ op: 1, d: sequence }));
            };
            // Jitter first beat, then steady interval (Discord recommendation).
            const jitter = Math.floor(interval * Math.random());
            setTimeout(() => {
              sendHeartbeat();
              heartbeatTimer = setInterval(sendHeartbeat, interval);
            }, jitter);

            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send(
                JSON.stringify({
                  op: 2,
                  d: {
                    token,
                    intents: GATEWAY_INTENTS,
                    properties: {
                      os: process.platform,
                      browser: 'ctrl-c',
                      device: 'ctrl-c',
                    },
                  },
                })
              );
            }
            return;
          }

          if (payload.op === 7 || payload.op === 9) {
            try {
              ws?.close();
            } catch {
              // ignore
            }
            return;
          }

          if (payload.op === 0 && payload.t === 'MESSAGE_CREATE') {
            const message =
              payload.d && typeof payload.d === 'object'
                ? (payload.d as DiscordMessageCreate)
                : {};
            const draft = discordMessageToDraft(message);
            if (!draft) {
              return;
            }
            void Promise.resolve(onInbound(draft)).catch(() => {
              // Keep the gateway loop; manager/gateway logs agent failures.
            });
          }
        });
      });
    } catch (err) {
      if (session.abort.signal.aborted) {
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('abort') || message.includes('AbortError')) {
        return;
      }
    } finally {
      clearHeartbeat();
      if (ws) {
        try {
          ws.close();
        } catch {
          // ignore
        }
      }
    }

    if (session.abort.signal.aborted) {
      return;
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }
}

/**
 * Real Discord adapter: outbound via webhook or bot token;
 * inbound via Bot Gateway WebSocket (MESSAGE_CREATE).
 * Without a webhook/bot token, start/send no-op so local contracts still work.
 */
export const discordAdapter: ChannelAdapter = {
  kind: 'discord',

  async start(channel, onInbound) {
    const existing = sessions.get(channel.id);
    if (existing) {
      existing.abort.abort();
      sessions.delete(channel.id);
    }

    const token = botToken(channel);
    const url = webhookUrl(channel);

    // Outbound-only webhook mode: probe reachability, no inbound loop.
    if (!token) {
      if (!url) {
        return;
      }
      const res = await fetch(url, { method: 'GET' });
      if (!res.ok && res.status !== 204 && res.status !== 405) {
        const body = await res.text().catch(() => '');
        throw new Error(
          `discord: webhook probe failed (${res.status})${body ? `: ${body}` : ''}`
        );
      }
      return;
    }

    if (token === 'fail') {
      throw new Error('discord: simulated start failure');
    }

    // Validate token before opening the gateway loop.
    await fetchGatewayUrl(token);

    const abort = new AbortController();
    const session: DiscordSession = {
      abort,
      loop: Promise.resolve(),
    };
    sessions.set(channel.id, session);
    session.loop = runGateway(token, session, onInbound).finally(() => {
      if (sessions.get(channel.id) === session) {
        sessions.delete(channel.id);
      }
    });
  },

  async stop(channelId) {
    const session = sessions.get(channelId);
    if (!session) {
      return;
    }
    session.abort.abort();
    sessions.delete(channelId);
    try {
      await session.loop;
    } catch {
      // ignore
    }
  },

  async sendMessage(channel, externalUserId, text) {
    if (!text) {
      throw new Error('discord: missing text');
    }
    const url = webhookUrl(channel);
    const token = botToken(channel);
    if (!url && !token) {
      // Mock mode for contract tests without credentials.
      return;
    }
    if (token === 'fail') {
      throw new Error('discord: simulated send failure');
    }
    if (url) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(
          `discord: sendMessage failed (${res.status})${body ? `: ${body}` : ''}`
        );
      }
      return;
    }
    // Bot-token path: post to channel via Discord API.
    const channelId = externalUserId;
    if (!channelId || !token) {
      throw new Error('discord: missing channel id or bot token');
    }
    const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bot ${token}`,
      },
      body: JSON.stringify({ content: text }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(
        `discord: sendMessage failed (${res.status})${body ? `: ${body}` : ''}`
      );
    }
  },
};
