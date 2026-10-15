import type {
  ChannelConfig,
  ChannelKind,
  ChannelMessage,
} from '@involvex/ctrl-s';

export type InboundHandler = (message: ChannelMessage) => void | Promise<void>;

/** Thin transport adapter — start/stop + send/receive. */
export type ChannelAdapter = {
  readonly kind: ChannelKind;
  start(channel: ChannelConfig, onInbound: InboundHandler): Promise<void>;
  stop(channelId: string): Promise<void>;
  sendMessage(
    channel: ChannelConfig,
    externalUserId: string,
    text: string
  ): Promise<void>;
};
