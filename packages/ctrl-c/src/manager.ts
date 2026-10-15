import type {
  ChannelConfig,
  ChannelMessage,
  ChannelPublic,
  CreateChannelInput,
  InboundWebhook,
  OutboxJob,
  SendChannelMessageInput,
  UpsertIdentityInput,
} from '@involvex/ctrl-s';
import type { ChannelStore } from '@involvex/ctrl-z';
import { discordAdapter } from './adapters/mock-bot';
import { slackAdapter } from './adapters/mock-bot';
import { telegramAdapter } from './adapters/mock-bot';
import { webhookAdapter } from './adapters/webhook';
import {
  createDefaultChannelRateLimiter,
  type RateLimiter,
} from './rate-limit';
import { nextRetryDelayMs, shouldRetry } from './retry';
import type { ChannelAdapter, InboundHandler } from './types';

const adapters: Record<string, ChannelAdapter> = {
  webhook: webhookAdapter,
  telegram: telegramAdapter,
  discord: discordAdapter,
  slack: slackAdapter,
};

export type ChannelManagerOptions = {
  store: ChannelStore;
  rateLimiter?: RateLimiter;
  onInbound?: InboundHandler;
};

export class ChannelManager {
  private readonly store: ChannelStore;
  private readonly rateLimiter: RateLimiter;
  private readonly onInbound?: InboundHandler;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(opts: ChannelManagerOptions) {
    this.store = opts.store;
    this.rateLimiter = opts.rateLimiter ?? createDefaultChannelRateLimiter();
    this.onInbound = opts.onInbound;
  }

  startWorker(intervalMs = 1000): void {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => {
      void this.processOutbox();
    }, intervalMs);
  }

  stopWorker(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  list(workspaceId: string): ChannelPublic[] {
    return this.store.listChannels(workspaceId);
  }

  get(channelId: string): ChannelPublic | null {
    return this.store.getChannelPublic(channelId);
  }

  /** Full config including secrets — server-side only. */
  getConfig(channelId: string): ChannelConfig | null {
    return this.store.getChannel(channelId);
  }

  async create(
    workspaceId: string,
    input: CreateChannelInput
  ): Promise<ChannelPublic> {
    const channel = this.store.createChannel(workspaceId, input);
    await this.startChannel(channel.id);
    return this.store.getChannelPublic(channel.id)!;
  }

  async startChannel(channelId: string): Promise<ChannelPublic> {
    const channel = this.store.getChannel(channelId);
    if (!channel) {
      throw new Error('channel not found');
    }
    const adapter = adapters[channel.kind];
    if (!adapter) {
      throw new Error(`unsupported channel kind: ${channel.kind}`);
    }
    this.store.setStatus(channelId, 'starting');
    try {
      await adapter.start(channel, async (message) => {
        if (this.onInbound) {
          await this.onInbound(message);
        }
      });
      this.store.setStatus(channelId, 'running');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.store.setStatus(channelId, 'error', msg);
      throw err;
    }
    return this.store.getChannelPublic(channelId)!;
  }

  async stopChannel(channelId: string): Promise<ChannelPublic> {
    const channel = this.store.getChannel(channelId);
    if (!channel) {
      throw new Error('channel not found');
    }
    const adapter = adapters[channel.kind];
    if (adapter) {
      await adapter.stop(channelId);
    }
    this.store.setStatus(channelId, 'stopped');
    return this.store.getChannelPublic(channelId)!;
  }

  enqueue(channelId: string, input: SendChannelMessageInput): OutboxJob {
    if (!this.store.getChannel(channelId)) {
      throw new Error('channel not found');
    }
    return this.store.enqueueOutbound(
      channelId,
      input.externalUserId,
      input.text
    );
  }

  async handleInbound(
    channelId: string,
    body: InboundWebhook
  ): Promise<ChannelMessage> {
    const channel = this.store.getChannel(channelId);
    if (!channel) {
      throw new Error('channel not found');
    }
    if (channel.status !== 'running') {
      throw new Error('channel is not running');
    }

    this.store.upsertIdentity(channelId, channel.workspaceId, {
      externalUserId: body.externalUserId,
      displayName: body.displayName,
    });

    const message = this.store.recordMessage({
      channelId,
      direction: 'inbound',
      externalUserId: body.externalUserId,
      text: body.text,
    });

    if (this.onInbound) {
      await this.onInbound(message);
    }
    return message;
  }

  upsertIdentity(channelId: string, input: UpsertIdentityInput) {
    const channel = this.store.getChannel(channelId);
    if (!channel) {
      throw new Error('channel not found');
    }
    return this.store.upsertIdentity(channelId, channel.workspaceId, input);
  }

  listIdentities(channelId: string) {
    return this.store.listIdentities(channelId);
  }

  listMessages(channelId: string) {
    return this.store.listMessages(channelId);
  }

  listOutbox(channelId: string) {
    return this.store.listOutbox(channelId);
  }

  async processOutbox(now = Date.now()): Promise<number> {
    const jobs = this.store.claimDueJobs(now);
    let sent = 0;
    for (const job of jobs) {
      if (!this.rateLimiter.tryTake(job.channelId, now)) {
        this.store.markOutboxFailed(
          job.id,
          'rate limited',
          now + 250,
          'pending'
        );
        continue;
      }
      const channel = this.store.getChannel(job.channelId);
      if (!channel) {
        this.store.markOutboxFailed(job.id, 'channel missing', now + 60_000);
        continue;
      }
      const adapter = adapters[channel.kind];
      if (!adapter) {
        this.store.markOutboxFailed(
          job.id,
          `no adapter for ${channel.kind}`,
          now + 60_000
        );
        continue;
      }
      try {
        await adapter.sendMessage(channel, job.externalUserId, job.text);
        this.store.markOutboxSent(job.id);
        this.store.recordMessage({
          channelId: job.channelId,
          direction: 'outbound',
          externalUserId: job.externalUserId,
          text: job.text,
        });
        sent += 1;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (shouldRetry(job.attempts)) {
          this.store.markOutboxFailed(
            job.id,
            msg,
            now + nextRetryDelayMs(job.attempts),
            'pending'
          );
        } else {
          this.store.markOutboxFailed(job.id, msg, now + 86_400_000);
        }
      }
    }
    return sent;
  }
}

export function getAdapter(kind: string): ChannelAdapter | null {
  return adapters[kind] ?? null;
}

export type { ChannelConfig };
