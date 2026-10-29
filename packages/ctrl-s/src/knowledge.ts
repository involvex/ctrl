import { z } from 'zod';

export const attachmentStatusSchema = z.enum(['pending', 'ready', 'failed']);

export type AttachmentStatus = z.infer<typeof attachmentStatusSchema>;

export const attachmentSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  conversationId: z.string().nullable(),
  filename: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  blobPath: z.string(),
  status: attachmentStatusSchema,
  error: z.string().nullable(),
  chunkCount: z.number().int().nonnegative().default(0),
  createdAt: z.number().int().nonnegative(),
});

export type Attachment = z.infer<typeof attachmentSchema>;

export const createAttachmentInputSchema = z.object({
  filename: z.string().min(1).max(500),
  mimeType: z.string().min(1).max(200).optional(),
  conversationId: z.string().optional(),
  /** UTF-8 text body (preferred for text/*). */
  text: z.string().max(2_000_000).optional(),
  /** Base64 blob when text is not used. */
  contentBase64: z.string().max(4_000_000).optional(),
});

export type CreateAttachmentInput = z.infer<typeof createAttachmentInputSchema>;

export const knowledgeChunkSchema = z.object({
  id: z.string(),
  attachmentId: z.string(),
  workspaceId: z.string(),
  chunkIndex: z.number().int().nonnegative(),
  content: z.string(),
  createdAt: z.number().int().nonnegative(),
});

export type KnowledgeChunk = z.infer<typeof knowledgeChunkSchema>;

/** How a knowledge hit was retrieved. */
export const knowledgeSearchModeSchema = z.enum(['fts', 'vector', 'hybrid']);

export type KnowledgeSearchMode = z.infer<typeof knowledgeSearchModeSchema>;

export const knowledgeHitSchema = z.object({
  chunkId: z.string(),
  attachmentId: z.string(),
  workspaceId: z.string(),
  filename: z.string(),
  snippet: z.string(),
  /** FTS bm25 rank or negative vector/fusion score (lower is better). */
  rank: z.number(),
  /** Relevance score (higher is better) for vector / hybrid hits. */
  score: z.number().optional(),
  /** Retrieval path that produced this hit. */
  source: knowledgeSearchModeSchema.optional(),
});

export type KnowledgeHit = z.infer<typeof knowledgeHitSchema>;

export const knowledgeSearchInputSchema = z.object({
  query: z.string().min(1).max(500),
  limit: z.number().int().positive().max(50).optional(),
  /** Defaults to hybrid when embeddings are enabled, otherwise fts. */
  mode: knowledgeSearchModeSchema.optional(),
});

export type KnowledgeSearchInput = z.infer<typeof knowledgeSearchInputSchema>;

export const knowledgeReindexInputSchema = z.object({
  /** Re-embed chunks that already have vectors for the active model. */
  force: z.boolean().optional(),
  /** Max chunks to embed in this pass. */
  limit: z.number().int().positive().max(5000).optional(),
});

export type KnowledgeReindexInput = z.infer<typeof knowledgeReindexInputSchema>;

export const knowledgeReindexResultSchema = z.object({
  workspaceId: z.string(),
  model: z.string(),
  indexed: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  totalChunks: z.number().int().nonnegative(),
  indexedChunks: z.number().int().nonnegative(),
});

export type KnowledgeReindexResult = z.infer<
  typeof knowledgeReindexResultSchema
>;

export const memoryKindSchema = z.enum(['note', 'fact', 'preference']);
export type MemoryKind = z.infer<typeof memoryKindSchema>;

export const memoryStatusSchema = z.enum([
  'active',
  'archived',
  'pending_review',
]);
export type MemoryStatus = z.infer<typeof memoryStatusSchema>;

export const memoryItemSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  kind: memoryKindSchema,
  content: z.string().min(1),
  sourceAttachmentId: z.string().nullable(),
  pinned: z.boolean(),
  status: memoryStatusSchema,
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});

export type MemoryItem = z.infer<typeof memoryItemSchema>;

export const createMemoryInputSchema = z.object({
  kind: memoryKindSchema.default('note'),
  content: z.string().min(1).max(20_000),
  sourceAttachmentId: z.string().optional(),
  pinned: z.boolean().optional(),
  status: memoryStatusSchema.optional(),
});

export type CreateMemoryInput = z.infer<typeof createMemoryInputSchema>;

export const updateMemoryInputSchema = z.object({
  content: z.string().min(1).max(20_000).optional(),
  kind: memoryKindSchema.optional(),
  pinned: z.boolean().optional(),
  status: memoryStatusSchema.optional(),
});

export type UpdateMemoryInput = z.infer<typeof updateMemoryInputSchema>;

export const contextInspectSchema = z.object({
  workspaceId: z.string(),
  conversationId: z.string().nullable(),
  recentMessages: z.array(
    z.object({
      role: z.string(),
      content: z.string(),
      createdAt: z.number(),
    })
  ),
  pinnedMemory: z.array(memoryItemSchema),
  knowledgeHits: z.array(knowledgeHitSchema),
  assembledPreview: z.string(),
});

export type ContextInspect = z.infer<typeof contextInspectSchema>;
