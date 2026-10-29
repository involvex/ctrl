import type {
  Embedder,
  KnowledgeChunk,
  KnowledgeReindexResult,
} from '@involvex/ctrl-s';
import type { KnowledgeStore } from '@involvex/ctrl-z';

const DEFAULT_BATCH = 32;

/**
 * Embed chunks and persist their vectors.
 * Returns the number of vectors stored; failures leave chunks unembedded so
 * a later reindex can retry them.
 */
export async function embedChunks(
  knowledge: KnowledgeStore,
  embedder: Embedder,
  chunks: KnowledgeChunk[]
): Promise<number> {
  if (chunks.length === 0) {
    return 0;
  }
  let stored = 0;
  for (let offset = 0; offset < chunks.length; offset += DEFAULT_BATCH) {
    const batch = chunks.slice(offset, offset + DEFAULT_BATCH);
    const vectors = await embedder.embed(batch.map((chunk) => chunk.content));
    for (let i = 0; i < batch.length; i++) {
      const chunk = batch[i]!;
      const vector = vectors[i];
      if (!vector || vector.length === 0) {
        continue;
      }
      knowledge.upsertChunkVector({
        chunkId: chunk.id,
        workspaceId: chunk.workspaceId,
        attachmentId: chunk.attachmentId,
        model: embedder.model,
        vector: Float32Array.from(vector),
      });
      stored += 1;
    }
  }
  return stored;
}

/**
 * Backfill vectors for every chunk in a workspace.
 * `force` re-embeds chunks that already have a vector for the active model.
 */
export async function reindexWorkspaceVectors(
  knowledge: KnowledgeStore,
  embedder: Embedder,
  workspaceId: string,
  opts: { force?: boolean; limit?: number } = {}
): Promise<KnowledgeReindexResult> {
  const totalChunks = knowledge.countChunks(workspaceId);
  const limit = opts.limit ?? totalChunks;
  const chunks = knowledge.listChunksNeedingVectors(
    workspaceId,
    embedder.model,
    {
      force: opts.force ?? false,
      limit,
    }
  );
  const indexed = await embedChunks(knowledge, embedder, chunks);
  return {
    workspaceId,
    model: embedder.model,
    indexed,
    skipped: chunks.length - indexed,
    totalChunks,
    indexedChunks: knowledge.countVectors(workspaceId, embedder.model),
  };
}
