import { z } from 'zod';

/**
 * Embedding backends.
 * - `off`  – no vectors (FTS only)
 * - `hash` – deterministic local feature hashing (offline default, no secrets)
 * - `openai` / `llama` / `litert` – OpenAI-compatible `/embeddings` endpoints
 */
export const embeddingProviderIdSchema = z.enum([
  'off',
  'hash',
  'openai',
  'llama',
  'litert',
]);

export type EmbeddingProviderId = z.infer<typeof embeddingProviderIdSchema>;

export const embeddingConfigSchema = z.object({
  provider: embeddingProviderIdSchema.default('hash'),
  model: z.string().min(1).default('local-hash'),
  /** Nominal dimensions; OpenAI-compatible endpoints may return a different size. */
  dims: z.number().int().min(32).max(8192).default(384),
  baseUrl: z.string().url().optional(),
});

export type EmbeddingConfig = z.infer<typeof embeddingConfigSchema>;

export const embeddingStatusSchema = z.object({
  provider: embeddingProviderIdSchema,
  model: z.string(),
  /** 0 when embeddings are disabled. */
  dims: z.number().int().nonnegative(),
  enabled: z.boolean(),
  indexedChunks: z.number().int().nonnegative(),
  totalChunks: z.number().int().nonnegative(),
  hint: z.string().optional(),
});

export type EmbeddingStatus = z.infer<typeof embeddingStatusSchema>;

export type EmbeddingContext = {
  signal?: AbortSignal;
};

/** Minimal embedding contract shared by gateway, knowledge and clients. */
export interface Embedder {
  readonly id: EmbeddingProviderId;
  readonly model: string;
  /** Nominal dimensions. Stored vectors may differ for remote providers. */
  readonly dims: number;
  embed(texts: string[], ctx?: EmbeddingContext): Promise<number[][]>;
}
