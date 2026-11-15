import type {
  AdapterInboundHandler,
  ChannelAdapter,
  InboundDraft,
} from '../types';

type SlackSession = {
  abort: AbortController;
  loop: Promise<void>;
};

const sessions = new Map<string, SlackSession>();

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

function appToken(channel: {
  config: Record<string, unknown>;
}): string | undefined {
  const fromApp =
    typeof channel.config['appToken'] === 'string'
      ? channel.config['appToken']
      : typeof channel.config['socketToken'] === 'string'
        ? channel.config['socketToken']
        : undefined;
  return fromApp || undefined;
}

type SlackMessageEvent = {
  type?: string;
  subtype?: string;
  user?: string;
  bot_id?: string;
  text?: string;
  channel?: string;
  channel_type?: string;
};

type SlackEnvelope = {
  envelope_id?: string;
  type?: string;
  payload?: {
    event?: SlackMessageEvent;
    event_id?: string;
  };
};

/** Map a Slack message event to an inbound draft (or null to skip). */
export function slackEventToDraft(
  event: SlackMessageEvent
): InboundDraft | null {
  if (event.type !== 'message') {
    return null;
  }
  // Skip edits, deletes, bot posts, and other subtypes.
  if (event.subtype) {
    return null;
  }
  if (event.bot_id) {
    return null;
  }
  const text = event.text?.trim();
  const channelId = event.channel;
  const userId = event.user;
  if (!text || !channelId || !userId) {
    return null;
  }
  return {
    // Reply target is the Slack conversation id (channel / DM).
    externalUserId: channelId,
    text,
    displayName: userId,
  };
}

async function openSocketUrl(
  xappToken: string,
  signal?: AbortSignal
): Promise<string> {
  const res = await fetch('https://slack.com/api/apps.connections.open', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${xappToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: '',
    signal,
  });
  const raw: unknown = await res.json().catch(() => null);
  if (!raw || typeof raw !== 'object') {
    throw new Error(
      `slack: apps.connections.open failed (${res.status}): invalid JSON`
    );
  }
  const record = raw as { ok?: boolean; url?: string; error?: string };
  if (!res.ok || record.ok !== true || typeof record.url !== 'string') {
    throw new Error(
      `slack: apps.connections.open failed${record.error ? `: ${record.error}` : ` (${res.status})`}`
    );
  }
  return record.url;
}

function parseEnvelope(raw: string): SlackEnvelope | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    const record = parsed as Record<string, unknown>;
    const envelope: SlackEnvelope = {};
    if (typeof record['envelope_id'] === 'string') {
      envelope.envelope_id = record['envelope_id'];
    }
    if (typeof record['type'] === 'string') {
      envelope.type = record['type'];
    }
    if (record['payload'] && typeof record['payload'] === 'object') {
      envelope.payload = record['payload'] as SlackEnvelope['payload'];
    }
    return envelope;
  } catch {
    return null;
  }
}

async function runSocketMode(
  xappToken: string,
  session: SlackSession,
  onInbound: AdapterInboundHandler
): Promise<void> {
  while (!session.abort.signal.aborted) {
    let ws: WebSocket | null = null;

    try {
      const url = await openSocketUrl(xappToken, session.abort.signal);
      if (session.abort.signal.aborted) {
        return;
      }

      ws = new WebSocket(url);

      await new Promise<void>((resolve, reject) => {
        if (!ws) {
          reject(new Error('slack: websocket missing'));
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
          () => reject(new Error('slack: websocket error')),
          { once: true }
        );
      });

      await new Promise<void>((resolve, reject) => {
        if (!ws) {
          reject(new Error('slack: websocket missing'));
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
        session.abort.signal.addEventListener('abort', onAbort);

        ws.addEventListener('close', () => {
          session.abort.signal.removeEventListener('abort', onAbort);
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
          const envelope = parseEnvelope(data);
          if (!envelope) {
            return;
          }

          if (envelope.envelope_id && ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ envelope_id: envelope.envelope_id }));
          }

          if (envelope.type === 'disconnect') {
            try {
              ws?.close();
            } catch {
              // ignore
            }
            return;
          }

          if (envelope.type !== 'events_api') {
            return;
          }

          const draft = slackEventToDraft(envelope.payload?.event ?? {});
          if (!draft) {
            return;
          }
          void Promise.resolve(onInbound(draft)).catch(() => {
            // Keep the socket loop; manager/gateway logs agent failures.
          });
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
 * Real Slack adapter: outbound via incoming webhook or bot token;
 * inbound via Socket Mode (app-level xapp token).
 * Without credentials, start/send no-op so local contracts still work.
 */
export const slackAdapter: ChannelAdapter = {
  kind: 'slack',

  async start(channel, onInbound) {
    const existing = sessions.get(channel.id);
    if (existing) {
      existing.abort.abort();
      sessions.delete(channel.id);
    }

    const token = botToken(channel);
    const xapp = appToken(channel);
    const url = webhookUrl(channel);

    // Socket Mode inbound when app token is present.
    if (xapp) {
      if (xapp === 'fail' || token === 'fail') {
        throw new Error('slack: simulated start failure');
      }
      // Validate the app token can open a connection before backgrounding.
      await openSocketUrl(xapp);

      const abort = new AbortController();
      const session: SlackSession = {
        abort,
        loop: Promise.resolve(),
      };
      sessions.set(channel.id, session);
      session.loop = runSocketMode(xapp, session, onInbound).finally(() => {
        if (sessions.get(channel.id) === session) {
          sessions.delete(channel.id);
        }
      });
      return;
    }

    // Outbound-only webhook/bot mode: optional probe, no inbound loop.
    if (!url && !token) {
      return;
    }
    if (token === 'fail') {
      throw new Error('slack: simulated start failure');
    }
    if (url) {
      const res = await fetch(url, { method: 'POST', body: '' });
      // Incoming webhooks return 400 on empty body; treat any non-404/401 as reachable.
      if (res.status === 401 || res.status === 403 || res.status === 404) {
        const body = await res.text().catch(() => '');
        throw new Error(
          `slack: webhook probe failed (${res.status})${body ? `: ${body}` : ''}`
        );
      }
    }
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
      throw new Error('slack: missing text');
    }
    const url = webhookUrl(channel);
    const token = botToken(channel);
    if (!url && !token) {
      // Mock mode for contract tests without credentials.
      return;
    }
    if (token === 'fail') {
      throw new Error('slack: simulated send failure');
    }
    if (url) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(
          `slack: sendMessage failed (${res.status})${body ? `: ${body}` : ''}`
        );
      }
      return;
    }
    // Bot-token path: post to channel via Slack Web API.
    const channelId = externalUserId;
    if (!channelId || !token) {
      throw new Error('slack: missing channel id or bot token');
    }
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ channel: channelId, text }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(
        `slack: sendMessage failed (${res.status})${body ? `: ${body}` : ''}`
      );
    }
    const raw: unknown = await res.json().catch(() => null);
    if (raw && typeof raw === 'object') {
      const record = raw as Record<string, unknown>;
      if (record['ok'] === false) {
        const err =
          typeof record['error'] === 'string'
            ? record['error']
            : 'sendMessage failed';
        throw new Error(`slack: ${err}`);
      }
    }
  },
};
