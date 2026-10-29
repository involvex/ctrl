import {
  knowledgeHitSchema,
  type Embedder,
  type KnowledgeHit,
  type KnowledgeSearchMode,
} from '@involvex/ctrl-s';
import type { KnowledgeStore, StoredVector } from '@involvex/ctrl-z';

const RRF_K = 60;

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
  radius = 110
): string {
  const flat = content.replace(/\s+/g, ' ').trim();
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
  return `${start > 0 ? '…' : ''}${flat.slice(start, end)}${
    end < flat.length ? '…' : ''
  }`;
}

async function vectorHits(
  knowledge: KnowledgeStore,
  embedder: Embedder,
  workspaceId: string,
  query: string,
  limit: number
): Promise<KnowledgeHit[]> {
  const [queryVector] = await embedder.embed([query]);
  if (!queryVector || queryVector.length === 0) {
    return [];
  }
  const queryFloat = Float32Array.from(queryVector);
  const stored = knowledge.listVectors(workspaceId, embedder.model);
  const scored = stored
    .filter((row: StoredVector) => row.vector.length === queryFloat.length)
    .map((row) => ({
      row,
      score: cosineSimilarity(queryFloat, row.vector),
    }))
    .filter((entry) => entry.score > 0);

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
      source: 'vector',
    })
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
  opts: KnowledgeSearchOptions = {}
): Promise<KnowledgeHit[]> {
  const limit = opts.limit ?? 8;
  const candidateLimit = opts.candidateLimit ?? Math.max(limit * 4, 24);
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return [];
  }
  const requested = opts.mode ?? (embedder ? 'hybrid' : 'fts');

  if (requested === 'fts' || !embedder) {
    return knowledge.searchKnowledge(workspaceId, trimmed, limit);
  }

  if (requested === 'vector') {
    return vectorHits(
      knowledge,
      embedder,
      workspaceId,
      trimmed,
      candidateLimit
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
      candidateLimit
    );
  } catch (err) {
    // Vector failures must not break retrieval; degrade to FTS.
    process.stderr.write(
      `[ctrl-k] vector search failed: ${
        err instanceof Error ? err.message : String(err)
      }\n`
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
        source: 'hybrid',
      })
  );
}
