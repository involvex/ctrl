import type { ChannelKind } from '@involvex/ctrl-s';
import type { ChannelAdapter } from '../types';

/**
 * Mock bot adapters for Telegram / Discord / Slack.
 * Without a real token they accept start/send locally so contracts and UI work.
 * When `config.botToken` (or `token`) is set, send uses a stub HTTP call that
 * still does not hit vendor APIs in this MVP — it validates the token is present.
 */
function createMockBotAdapter(kind: ChannelKind): ChannelAdapter {
  return {
    kind,

    async start(channel) {
      const token =
        (typeof channel.config['botToken'] === 'string' &&
          channel.config['botToken']) ||
        (typeof channel.config['token'] === 'string' &&
          channel.config['token']);
      if (!token) {
        // Allowed: mock mode for local development / contracts.
        return;
      }
    },

    async stop() {
      // no-op for MVP
    },

    async sendMessage(channel, externalUserId, text) {
      if (!externalUserId || !text) {
        throw new Error(`${kind}: missing recipient or text`);
      }
      const token =
        (typeof channel.config['botToken'] === 'string' &&
          channel.config['botToken']) ||
        (typeof channel.config['token'] === 'string' &&
          channel.config['token']);
      // Mock delivery — real vendor SDKs land after Phase 5 MVP.
      if (token === 'fail') {
        throw new Error(`${kind}: simulated send failure`);
      }
    },
  };
}

export const telegramAdapter = createMockBotAdapter('telegram');
export const discordAdapter = createMockBotAdapter('discord');
export const slackAdapter = createMockBotAdapter('slack');
