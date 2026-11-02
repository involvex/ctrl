import type { ChannelAdapter } from '../types';

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

/**
 * Real Discord adapter (outbound via webhook or bot token).
 * Without a webhook/bot token, start/send no-op so local contracts still work.
 */
export const discordAdapter: ChannelAdapter = {
  kind: 'discord',

  async start(channel) {
    const url = webhookUrl(channel);
    const token = botToken(channel);
    if (!url && !token) {
      return;
    }
    if (url) {
      // Validate the webhook URL is reachable.
      const res = await fetch(url, { method: 'GET' });
      if (!res.ok && res.status !== 204 && res.status !== 405) {
        const body = await res.text().catch(() => '');
        throw new Error(
          `discord: webhook probe failed (${res.status})${body ? `: ${body}` : ''}`
        );
      }
    }
  },

  async stop() {
    // stateless
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
    const res = await fetch(
      `https://discord.com/api/v10/channels/${channelId}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bot ${token}`,
        },
        body: JSON.stringify({ content: text }),
      }
    );
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(
        `discord: sendMessage failed (${res.status})${body ? `: ${body}` : ''}`
      );
    }
  },
};
