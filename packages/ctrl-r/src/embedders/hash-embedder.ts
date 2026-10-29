import type { Embedder } from '@involvex/ctrl-s';

/**
 * Deterministic local embedder based on feature hashing (FNV-1a).
 *
 * It is not a semantic model, but it is dependency-free, fast and offline:
 * good default so vector/hybrid search works out of the box, and stable
 * enough for contract tests. Configure an OpenAI-compatible endpoint for
 * real semantic quality.
 */

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

function hash32(input: string): number {
  let hash = FNV_OFFSET;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash >>> 0;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function embedOne(text: string, dims: number): Float32Array {
  const vector = new Float32Array(dims);
  const tokens = tokenize(text);
  if (tokens.length === 0) {
    return vector;
  }

  const addFeature = (feature: string, weight: number): void => {
    const index = hash32(feature) % dims;
    const sign = hash32(`sign:${feature}`) % 2 === 0 ? 1 : -1;
    vector[index] = (vector[index] ?? 0) + sign * weight;
  };

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    addFeature(token, 1);
    // Prefix features keep partial matches in the same neighborhood.
    if (token.length >= 4) {
      addFeature(token.slice(0, 4), 0.35);
    }
    const next = tokens[i + 1];
    if (next) {
      addFeature(`${token}_${next}`, 0.5);
    }
  }

  // L2 normalize so cosine similarity is a plain dot product.
  let norm = 0;
  for (let i = 0; i < vector.length; i++) {
    const value = vector[i]!;
    norm += value * value;
  }
  if (norm > 0) {
    const scale = 1 / Math.sqrt(norm);
    for (let i = 0; i < vector.length; i++) {
      vector[i] = vector[i]! * scale;
    }
  }
  return vector;
}

export type HashEmbedderConfig = {
  dims?: number;
  model?: string;
};

export function createHashEmbedder(config: HashEmbedderConfig = {}): Embedder {
  const dims = config.dims ?? 384;
  const model = config.model ?? hashModelName(dims);
  return {
    id: 'hash',
    model,
    dims,
    embed(texts) {
      return Promise.resolve(
        texts.map((text) => Array.from(embedOne(text, dims)))
      );
    },
  };
}

/** Exported for tests and for callers that want raw vectors. */
export function embedHashText(text: string, dims = 384): Float32Array {
  return embedOne(text, dims);
}

/** Model name encodes dims so re-indexing on dims changes is detectable. */
export function hashModelName(dims: number): string {
  return `local-hash-${dims}`;
}

export type HashEmbedder = Embedder & { id: 'hash' };
