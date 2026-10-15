import { z } from 'zod';

export const channelKindSchema = z.enum([
  'webhook',
  'telegram',
  'discord',
  'slack',
]);
export type ChannelKind = z.infer<typeof channelKindSchema>;

export const channelStatusSchema = z.enum([
  'stopped',
  'starting',
  'running',
  'error',
]);
export type ChannelStatus = z.infer<typeof channelStatusSchema>;

export const channelConfigSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  kind: channelKindSchema,
  name: z.string().min(1),
  /** Opaque config (bot token, webhook secret, etc.). Never echo secrets to clients. */
  config: z.record(z.unknown()).default({}),
  status: channelStatusSchema,
  lastError: z.string().nullable(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});

export type ChannelConfig = z.infer<typeof channelConfigSchema>;

export const channelPublicSchema = channelConfigSchema.omit({ config: true });
export type ChannelPublic = z.infer<typeof channelPublicSchema>;

export const createChannelInputSchema = z.object({
  kind: channelKindSchema,
  name: z.string().min(1).max(200),
  config: z.record(z.unknown()).optional(),
});

export type CreateChannelInput = z.infer<typeof createChannelInputSchema>;

export const channelMessageSchema = z.object({
  id: z.string(),
  channelId: z.string(),
  direction: z.enum(['inbound', 'outbound']),
  externalUserId: z.string(),
  text: z.string(),
  conversationId: z.string().nullable(),
  createdAt: z.number().int().nonnegative(),
});

export type ChannelMessage = z.infer<typeof channelMessageSchema>;

export const channelIdentitySchema = z.object({
  id: z.string(),
  channelId: z.string(),
  externalUserId: z.string(),
  displayName: z.string().nullable(),
  localUserId: z.string().nullable(),
  workspaceId: z.string(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});

export type ChannelIdentity = z.infer<typeof channelIdentitySchema>;

export const upsertIdentityInputSchema = z.object({
  externalUserId: z.string().min(1).max(200),
  displayName: z.string().max(200).optional(),
  localUserId: z.string().max(200).optional(),
});

export type UpsertIdentityInput = z.infer<typeof upsertIdentityInputSchema>;

export const outboxStatusSchema = z.enum([
  'pending',
  'sending',
  'sent',
  'failed',
]);
export type OutboxStatus = z.infer<typeof outboxStatusSchema>;

export const outboxJobSchema = z.object({
  id: z.string(),
  channelId: z.string(),
  externalUserId: z.string(),
  text: z.string(),
  status: outboxStatusSchema,
  attempts: z.number().int().nonnegative(),
  nextAttemptAt: z.number().int().nonnegative(),
  lastError: z.string().nullable(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});

export type OutboxJob = z.infer<typeof outboxJobSchema>;

export const sendChannelMessageInputSchema = z.object({
  externalUserId: z.string().min(1).max(200),
  text: z.string().min(1).max(20_000),
});

export type SendChannelMessageInput = z.infer<
  typeof sendChannelMessageInputSchema
>;

export const inboundWebhookSchema = z.object({
  externalUserId: z.string().min(1).max(200),
  text: z.string().min(1).max(20_000),
  displayName: z.string().max(200).optional(),
});

export type InboundWebhook = z.infer<typeof inboundWebhookSchema>;
