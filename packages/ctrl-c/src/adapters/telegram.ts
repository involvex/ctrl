import type {
  AdapterInboundHandler,
  ChannelAdapter,
  InboundDraft,
} from '../types';

type TelegramSession = {
  abort: AbortController;
  offset: number;
  loop: Promise<void>;
};

const sessions = new Map<string, TelegramSession>();

function botToken(channel: {
  config: Record<string, unknown>;
}): string | undefined {
  const fromBot =
    typeof channel.config['botToken'] === 'string'
      ? channel.config['botToken']
      : undefined;
  const fromToken =
    typeof channel.config['token'] === 'string'
      ? channel.config['token']
      : undefined;
  return fromBot || fromToken || undefined;
}

type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    text?: string;
    chat: { id: number };
    from?: {
      id: number;
      first_name?: string;
      last_name?: string;
      username?: string;
    };
  };
};

async function telegramApi<T>(
  token: string,
  method: string,
  body?: Record<string, unknown>,
  signal?: AbortSignal
): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  const raw: unknown = await res.json();
  if (!raw || typeof raw !== 'object') {
    throw new Error(`telegram: ${method} failed (${res.status}): invalid JSON`);
  }
  const record = raw as Record<string, unknown>;
  if (!res.ok || record['ok'] !== true || record['result'] === undefined) {
    const desc =
      typeof record['description'] === 'string'
        ? `: ${record['description']}`
        : '';
    throw new Error(`telegram: ${method} failed (${res.status})${desc}`);
  }
  return record['result'] as T;
}

function displayNameFromUpdate(update: TelegramUpdate): string | undefined {
  const from = update.message?.from;
  if (!from) {
    return undefined;
  }
  const parts = [from.first_name, from.last_name].filter(Boolean);
  if (parts.length > 0) {
    return parts.join(' ');
  }
  return from.username;
}

function toInboundDraft(update: TelegramUpdate): InboundDraft | null {
  const text = update.message?.text?.trim();
  if (!text || !update.message) {
    return null;
  }
  const draft: InboundDraft = {
    externalUserId: String(update.message.chat.id),
    text,
  };
  const name = displayNameFromUpdate(update);
  if (name) {
    draft.displayName = name;
  }
  return draft;
}

async function pollLoop(
  token: string,
  session: TelegramSession,
  onInbound: AdapterInboundHandler
): Promise<void> {
  while (!session.abort.signal.aborted) {
    try {
      const updates = await telegramApi<TelegramUpdate[]>(
        token,
        'getUpdates',
        {
          timeout: 25,
          offset: session.offset,
          allowed_updates: ['message'],
        },
        session.abort.signal
      );
      for (const update of updates) {
        session.offset = update.update_id + 1;
        const draft = toInboundDraft(update);
        if (!draft) {
          continue;
        }
        try {
          await onInbound(draft);
        } catch {
          // Keep polling; manager/gateway logs agent-side failures.
        }
      }
    } catch (err) {
      if (session.abort.signal.aborted) {
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      // AbortError from fetch when stopped
      if (message.includes('abort') || message.includes('AbortError')) {
        return;
      }
      await new Promise((r) => setTimeout(r, 2_000));
    }
  }
}

/**
 * Telegram Bot API adapter: outbound sendMessage + inbound long-polling getUpdates.
 * Without a token, start/send no-op so local contracts still work.
 */
export const telegramAdapter: ChannelAdapter = {
  kind: 'telegram',

  async start(channel, onInbound) {
    const existing = sessions.get(channel.id);
    if (existing) {
      existing.abort.abort();
      sessions.delete(channel.id);
    }

    const token = botToken(channel);
    if (!token) {
      return;
    }
    if (token === 'fail') {
      throw new Error('telegram: simulated start failure');
    }

    await telegramApi<{ id: number; username?: string }>(token, 'getMe');

    const abort = new AbortController();
    const session: TelegramSession = {
      abort,
      offset: 0,
      loop: Promise.resolve(),
    };
    sessions.set(channel.id, session);
    session.loop = pollLoop(token, session, onInbound).finally(() => {
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
    if (!externalUserId || !text) {
      throw new Error('telegram: missing recipient or text');
    }
    const token = botToken(channel);
    if (!token) {
      // Mock mode for contract tests without a bot token.
      return;
    }
    if (token === 'fail') {
      throw new Error('telegram: simulated send failure');
    }
    await telegramApi(token, 'sendMessage', {
      chat_id: externalUserId,
      text,
    });
  },
};
