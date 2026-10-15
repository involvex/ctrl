import type { ChannelAdapter } from '../types';

/**
 * Webhook channel — inbound via HTTP hook; outbound is recorded locally
 * (no remote HTTP call unless `config.outboundUrl` is set).
 */
export const webhookAdapter: ChannelAdapter = {
  kind: 'webhook',

  start() {
    // Passive — gateway receives POSTs on /hooks/v1/:channelId
    return Promise.resolve();
  },

  stop() {
    return Promise.resolve();
  },

  async sendMessage(channel, externalUserId, text) {
    const outboundUrl =
      typeof channel.config['outboundUrl'] === 'string'
        ? channel.config['outboundUrl']
        : null;
    if (!outboundUrl) {
      // Local-only delivery: success without remote call.
      return;
    }
    const res = await fetch(outboundUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channelId: channel.id,
        externalUserId,
        text,
      }),
    });
    if (!res.ok) {
      throw new Error(`webhook outbound failed: ${res.status}`);
    }
  },
};
