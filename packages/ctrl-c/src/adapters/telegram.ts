import type { ChannelAdapter } from '../types';

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

/**
 * Real Telegram Bot API adapter (sendMessage).
 * Without a token, start/send no-op so local contracts still work.
 * Inbound polling is not enabled in this pass — outbound delivery only.
 */
export const telegramAdapter: ChannelAdapter = {
  kind: 'telegram',

  async start(channel) {
    const token = botToken(channel);
    if (!token) {
      return;
    }
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(
        `telegram: getMe failed (${res.status})${body ? `: ${body}` : ''}`
      );
    }
  },

  async stop() {
    // no long-poll session yet
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
    const res = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: externalUserId,
          text,
        }),
      }
    );
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(
        `telegram: sendMessage failed (${res.status})${body ? `: ${body}` : ''}`
      );
    }
  },
};
