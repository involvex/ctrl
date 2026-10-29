import { z } from 'zod';
import type { Embedder, EmbeddingProviderId } from '@involvex/ctrl-s';

export type OpenAiCompatibleEmbedderConfig = {
  id: Extract<EmbeddingProviderId, 'openai' | 'llama' | 'litert'>;
  baseUrl: string;
  model: string;
  apiKey?: string;
  /** Nominal dims; the endpoint response is authoritative. */
  dims?: number;
};

const embeddingResponseSchema = z.object({
  data: z
    .array(
      z.object({
        embedding: z.array(z.number()),
        index: z.number().int().nonnegative().optional(),
      })
    )
    .optional(),
  error: z.object({ message: z.string().optional() }).optional(),
});

/**
 * Embeddings via an OpenAI-compatible `/embeddings` endpoint.
 * Works with OpenAI, llama-server (`--embeddings`), litert-lm and gateways.
 */
export class OpenAiCompatibleEmbedder implements Embedder {
  readonly id: OpenAiCompatibleEmbedderConfig['id'];
  readonly model: string;
  readonly dims: number;
  private readonly baseUrl: string;
  private readonly apiKey?: string;

  constructor(config: OpenAiCompatibleEmbedderConfig) {
    this.id = config.id;
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.model = config.model;
    this.dims = config.dims ?? 1536;
    this.apiKey = config.apiKey;
  }

  async embed(
    texts: string[],
    ctx?: { signal?: AbortSignal }
  ): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    const res = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: this.model, input: texts }),
      signal: ctx?.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(
        `embeddings failed (${res.status})${detail ? `: ${detail}` : ''}`
      );
    }
    const body = embeddingResponseSchema.parse(await res.json());
    if (body.error?.message) {
      throw new Error(`embeddings error: ${body.error.message}`);
    }
    const data = body.data;
    if (!data || data.length !== texts.length) {
      throw new Error(
        `embeddings: expected ${texts.length} vectors, got ${data?.length ?? 0}`
      );
    }

    // Responses may be unordered; place each vector in its requested slot.
    const slots: Array<number[] | undefined> = [];
    for (let i = 0; i < texts.length; i++) {
      slots.push(undefined);
    }
    for (const [position, item] of data.entries()) {
      const slot = item.index ?? position;
      if (slot >= texts.length || slots[slot] !== undefined) {
        throw new Error(`embeddings: duplicate or invalid index ${slot}`);
      }
      if (item.embedding.length === 0) {
        throw new Error('embeddings: empty vector in response');
      }
      slots[slot] = item.embedding;
    }
    const vectors = slots.filter(
      (vector): vector is number[] => vector !== undefined
    );
    if (vectors.length !== texts.length) {
      throw new Error(
        `embeddings: expected ${texts.length} vectors, got ${vectors.length}`
      );
    }
    return vectors;
  }
}
