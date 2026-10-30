import {
  knowledgeHitSchema,
  type Embedder,
  type KnowledgeHit,
  type KnowledgeSearchMode,
} from "@involvex/ctrl-s";
import type { KnowledgeStore, StoredVector } from "@involvex/ctrl-z";
import { HnswIndex } from "./ann";

const RRF_K = 60;

function getAnnConfig() {
  return {
    threshold: Number(process.env["CTRL_KNOWLEDGE_ANN_THRESHOLD"]) || 500,
    efSearch: Number(process.env["CTRL_KNOWLEDGE_ANN_EF_SEARCH"]) || 50,
    m: Number(process.env["CTRL_KNOWLEDGE_ANN_M"]) || 16,
    efConstruction:
      Number(process.env["CTRL_KNOWLEDGE_ANN_EF_CONSTRUCTION"]) || 200,
    ttlMs: Number(process.env["CTRL_KNOWLEDGE_ANN_CACHE_TTL_MS"]) || 60000,
    maxCacheEntries: Number(process.env["CTRL_KNOWLEDGE_ANN_CACHE_MAX"]) || 32,
  };
}

// Simple in-memory cache of HNSW indexes with LRU
const indexCache = new Map<
  string,
  {
    index: HnswIndex;
    vectors: Map<string, StoredVector>;
    builtAt: number;
    lastAccess: number;
  }
>();

export type KnowledgeSearchOptions = {
  mode?: KnowledgeSearchMode;
  limit?: number;
  /** Candidates pulled from each retriever before fusion. */
  candidateLimit?: number;
};

/**
 * Select the `k` highest-scoring entries without mutating the input.
 * ES2022 has no `Array#toSorted`, so this is a small insertion selection.
 */
function topK<T>(items: T[], k: number, scoreOf: (item: T) => number): T[] {
  if (k <= 0) {
    return [];
  }
  const best: Array<{ item: T; score: number }> = [];
  for (const item of items) {
    const score = scoreOf(item);
    let index = best.length;
    while (index > 0 && best[index - 1]!.score < score) {
      index -= 1;
    }
    if (index >= k) {
      continue;
    }
    best.splice(index, 0, { item, score });
    if (best.length > k) {
      best.pop();
    }
  }
  return best.map((entry) => entry.item);
}

/** Cosine similarity over possibly different-length vectors (min length wins). */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  const length = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < length; i++) {
    const va = a[i]!;
    const vb = b[i]!;
    dot += va * vb;
    normA += va * va;
    normB += vb * vb;
  }
  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function tokenizeQuery(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length > 2);
}

/** Snippet centered on the first query term found in the chunk. */
export function buildSnippet(
  content: string,
  query: string,
  radius = 110,
): string {
  const flat = content.replace(/\s+/g, " ").trim();
  if (flat.length <= radius * 2) {
    return flat;
  }
  const lower = flat.toLowerCase();
  let position = -1;
  for (const token of tokenizeQuery(query)) {
    const index = lower.indexOf(token);
    if (index >= 0) {
      position = index;
      break;
    }
  }
  if (position < 0) {
    return `${flat.slice(0, radius * 2)}…`;
  }
  const start = Math.max(0, position - radius);
  const end = Math.min(flat.length, position + radius);
  return `${start > 0 ? "…" : ""}${flat.slice(start, end)}${
    end < flat.length ? "…" : ""
  }`;
}

async function vectorHits(
  knowledge: KnowledgeStore,
  embedder: Embedder,
  workspaceId: string,
  query: string,
  limit: number,
): Promise<KnowledgeHit[]> {
  const [queryVector] = await embedder.embed([query]);
  if (!queryVector || queryVector.length === 0) {
    return [];
  }
  const queryFloat = Float32Array.from(queryVector);
  const stored = knowledge.listVectors(workspaceId, embedder.model);
  const filtered = stored.filter(
    (row: StoredVector) => row.vector.length === queryFloat.length,
  );

  if (filtered.length === 0) {
    return [];
  }

  // Use ANN (HNSW) for larger corpora, brute force for small ones
  const annConfig = getAnnConfig();
  const useAnn = filtered.length > annConfig.threshold;
  let scored: Array<{ row: StoredVector; score: number }> = [];

  if (useAnn) {
    const cacheKey = `${workspaceId}:${embedder.model}`;
    let cached = indexCache.get(cacheKey);
    const now = Date.now();
    if (!cached || cached.builtAt < now - annConfig.ttlMs) {
      // Evict if cache too large (LRU)
      if (indexCache.size >= annConfig.maxCacheEntries) {
        let oldestKey: string | null = null;
        let oldestTime = Infinity;
        for (const [key, entry] of indexCache.entries()) {
          if (entry.lastAccess < oldestTime) {
            oldestTime = entry.lastAccess;
            oldestKey = key;
          }
        }
        if (oldestKey) {
          indexCache.delete(oldestKey);
        }
      }
      const index = new HnswIndex({
        m: annConfig.m,
        efConstruction: annConfig.efConstruction,
        efSearch: annConfig.efSearch,
      });
      const vectorMap = new Map<string, StoredVector>();
      for (const row of filtered) {
        vectorMap.set(row.chunkId, row);
        index.addNode(row.chunkId, row.vector);
      }
      cached = { index, vectors: vectorMap, builtAt: now, lastAccess: now };
      indexCache.set(cacheKey, cached);
    } else {
      cached.lastAccess = now;
    }
    const results = cached.index.search(queryFloat, Math.max(limit * 2, 100));
    for (const result of results) {
      const row = cached.vectors.get(result.id);
      if (row && result.score > 0) {
        scored.push({ row, score: result.score });
      }
    }
  } else {
    scored = filtered
      .map((row) => ({
        row,
        score: cosineSimilarity(queryFloat, row.vector),
      }))
      .filter((entry) => entry.score > 0);
  }

  const scoredTop = topK(scored, limit, (entry) => entry.score);

  return scoredTop.map(({ row, score }) =>
    knowledgeHitSchema.parse({
      chunkId: row.chunkId,
      attachmentId: row.attachmentId,
      workspaceId,
      filename: row.filename,
      snippet: buildSnippet(row.content, query),
      rank: -score,
      score,
      source: "vector",
    }),
  );
}

/**
 * FTS, vector or reciprocal-rank-fusion search over personal knowledge.
 *
 * `hybrid` (default when an embedder is present) fuses bm25 and cosine
 * rankings so exact keywords and paraphrases both surface.
 */
export async function searchKnowledgeHybrid(
  knowledge: KnowledgeStore,
  embedder: Embedder | null,
  workspaceId: string,
  query: string,
  opts: KnowledgeSearchOptions = {},
): Promise<KnowledgeHit[]> {
  const limit = opts.limit ?? 8;
  const candidateLimit = opts.candidateLimit ?? Math.max(limit * 4, 24);
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return [];
  }
  const requested = opts.mode ?? (embedder ? "hybrid" : "fts");

  if (requested === "fts" || !embedder) {
    return knowledge.searchKnowledge(workspaceId, trimmed, limit);
  }

  if (requested === "vector") {
    return vectorHits(
      knowledge,
      embedder,
      workspaceId,
      trimmed,
      candidateLimit,
    ).then((hits) => hits.slice(0, limit));
  }

  const fts = knowledge.searchKnowledge(workspaceId, trimmed, candidateLimit);
  let vector: KnowledgeHit[] = [];
  try {
    vector = await vectorHits(
      knowledge,
      embedder,
      workspaceId,
      trimmed,
      candidateLimit,
    );
  } catch (err) {
    // Vector failures must not break retrieval; degrade to FTS.
    process.stderr.write(
      `[ctrl-k] vector search failed: ${
        err instanceof Error ? err.message : String(err)
      }\n`,
    );
  }

  const fused = new Map<string, { hit: KnowledgeHit; score: number }>();
  const fuse = (hit: KnowledgeHit, rankIndex: number): void => {
    const increment = 1 / (RRF_K + rankIndex + 1);
    const existing = fused.get(hit.chunkId);
    if (existing) {
      existing.score += increment;
    } else {
      fused.set(hit.chunkId, { hit, score: increment });
    }
  };
  fts.forEach((hit, index) => fuse(hit, index));
  vector.forEach((hit, index) => fuse(hit, index));

  return topK([...fused.values()], limit, (entry) => entry.score).map(
    ({ hit, score }) =>
      knowledgeHitSchema.parse({
        ...hit,
        rank: -score,
        score,
        source: "hybrid",
      }),
  );
}

export function clearKnowledgeIndexCache(workspaceId?: string): void {
  if (workspaceId) {
    for (const key of indexCache.keys()) {
      if (key.startsWith(`${workspaceId}:`)) {
        indexCache.delete(key);
      }
    }
  } else {
    indexCache.clear();
  }
}
