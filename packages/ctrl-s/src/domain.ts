import { z } from 'zod';

export const workspaceSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});

export type Workspace = z.infer<typeof workspaceSchema>;

export const conversationSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  title: z.string().min(1),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});

export type Conversation = z.infer<typeof conversationSchema>;

export const messageRoleSchema = z.enum(['user', 'assistant', 'system']);

export type MessageRole = z.infer<typeof messageRoleSchema>;

export const messageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  role: messageRoleSchema,
  content: z.string(),
  createdAt: z.number().int().nonnegative(),
});

export type Message = z.infer<typeof messageSchema>;

export const createWorkspaceInputSchema = z.object({
  name: z.string().min(1).max(200),
});

export const createConversationInputSchema = z.object({
  workspaceId: z.string().min(1),
  title: z.string().min(1).max(200).optional(),
});

export const createMessageInputSchema = z.object({
  role: messageRoleSchema,
  content: z.string().min(1),
});
