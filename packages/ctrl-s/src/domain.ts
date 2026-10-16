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

/** Append-only sync payload (device → host). Existing ids are skipped. */
export const upsertMessagesInputSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().min(1),
      role: messageRoleSchema,
      content: z.string().min(1),
      createdAt: z.number().int().nonnegative(),
    })
  ),
});

export type UpsertMessagesInput = z.infer<typeof upsertMessagesInputSchema>;

/** Portable workspace dump for export/import (Phase 1). */
export const workspaceExportSchema = z.object({
  version: z.literal(1),
  exportedAt: z.number().int().nonnegative(),
  workspace: workspaceSchema,
  conversations: z.array(
    z.object({
      conversation: conversationSchema,
      messages: z.array(messageSchema),
    })
  ),
});

export type WorkspaceExport = z.infer<typeof workspaceExportSchema>;
