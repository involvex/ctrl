import type {
  ChannelConfig,
  ChannelKind,
  ChannelMessage,
} from '@involvex/ctrl-s';

export type InboundHandler = (message: ChannelMessage) => void | Promise<void>;

/** Raw inbound from an adapter before store persistence. */
export type InboundDraft = {
  externalUserId: string;
  text: string;
  displayName?: string;
};

export type AdapterInboundHandler = (
  draft: InboundDraft
) => void | Promise<void>;

/** Thin transport adapter — start/stop + send/receive. */
export type ChannelAdapter = {
  readonly kind: ChannelKind;
  start(
    channel: ChannelConfig,
    onInbound: AdapterInboundHandler
  ): Promise<void>;
  stop(channelId: string): Promise<void>;
  sendMessage(
    channel: ChannelConfig,
    externalUserId: string,
    text: string
  ): Promise<void>;
};
