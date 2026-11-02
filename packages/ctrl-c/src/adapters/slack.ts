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
 * Real Slack adapter (outbound via incoming webhook or bot token).
 * Without credentials, start/send no-op so local contracts still work.
 */
export const slackAdapter: ChannelAdapter = {
  kind: 'slack',

  async start(channel) {
    const url = webhookUrl(channel);
    const token = botToken(channel);
    if (!url && !token) {
      return;
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

  async stop() {
    // stateless
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
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
    };
    if (data && data.ok === false) {
      throw new Error(`slack: ${data.error ?? 'sendMessage failed'}`);
    }
  },
};
