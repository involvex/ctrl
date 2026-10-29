# ADR-0004: Personal Knowledge Vector & Hybrid Search

**Status:** Accepted

**Context:** Phase 4 shipped keyword retrieval only (`FTS5`/`bm25`). Exact-term search misses paraphrases ("coolant loop" vs "reactor cooling"), which is the most common way people query their own notes. A dedicated vector database (Qdrant, Chroma, sqlite-vec binary) would add a service or a native dependency to a local-first, Bun-only gateway.

**Decision:**

1. **Store vectors in SQLite.** Schema v5 adds `knowledge_vectors(chunk_id, workspace_id, attachment_id, model, dim, vector BLOB, created_at)`. Vectors are raw little-endian `float32` blobs; `chunk_id` is the primary key so re-embedding upserts in place and `ON DELETE CASCADE` keeps them in sync with chunks.
2. **Score in-process.** `ctrl-k` loads the workspace vectors and computes cosine similarity in TypeScript. Brute force is fine for personal knowledge sizes; a vector index is a later optimization behind the same store API (not an MVP requirement, per Plan §10).
3. **Pluggable embedder contract.** `ctrl-s` defines `Embedder` (`id`, `model`, `dims`, `embed(texts)`). `ctrl-r` provides:
   - `hash` — deterministic FNV-1a feature hashing over tokens, bigrams and 4-char prefixes, L2-normalized. Dependency-free, offline, and the default, so vector/hybrid search works with zero configuration and contract tests stay stable.
   - `openai | llama | litert` — OpenAI-compatible `POST /embeddings` (OpenAI, `llama-server --embeddings`, litert-lm).
   - `off` — no vectors; keyword search only.
     Configuration is env-only: `CTRL_EMBEDDINGS`, `CTRL_EMBEDDINGS_MODEL`, `CTRL_EMBEDDINGS_DIM`, `CTRL_EMBEDDINGS_BASE_URL`, `CTRL_EMBEDDINGS_API_KEY`.
4. **Hybrid fusion via RRF.** `knowledgeSearchInputSchema.mode` selects `fts | vector | hybrid`. Hybrid runs both retrievers and fuses with reciprocal rank fusion (`k = 60`), which needs no score calibration between `bm25` and cosine. Default is `hybrid` when an embedder exists, else `fts`.
5. **Embed on ingest, repair on demand.** Uploads embed chunks inline; an embedding failure is logged and leaves chunks unembedded instead of failing the upload. `POST /api/v1/workspaces/:id/knowledge/reindex` (`force`, `limit`) backfills or re-embeds; `GET /api/v1/embeddings` reports provider/model and `indexedChunks / totalChunks`.
6. **Hits stay backward compatible.** `knowledgeHitSchema` keeps `rank` (lower is better) and adds optional `score` (higher is better) and `source`. FTS hits set `source: 'fts'` and no score.

**Consequences:**

- No new runtime dependency, service, or native build; the gateway remains a single Bun binary.
- Costs are O(chunks × dims) per query and O(chunks) RAM for the vector list. Acceptable for personal corpora; document the limit and revisit with an ANN index (per-model table + `sqlite-vec` or HNSW) when workspaces grow past a few tens of thousands of chunks.
- Changing `CTRL_EMBEDDINGS_DIM` or the model leaves old vectors unmatched (search only compares equal-length vectors, and `listChunksNeedingVectors` is model-scoped). Run `reindex --force` after switching embedders.
- The `hash` embedder is lexical, not semantic: it catches stems, prefixes and word co-occurrence, not synonyms. Point `CTRL_EMBEDDINGS` at a real model for semantic recall.
- Vectors are stored unencrypted alongside chunk text; they are not secret material but they are derived from user documents, so backups (already passphrase-capable) cover them.

**Alternatives:** external vector DB (extra service, violates local-first/single-process), `sqlite-vec` (native extension, packaging cost per platform), embedding-only search (loses exact match and recall on rare tokens), score normalization instead of RRF (fragile across `bm25`/cosine scales).

**See:** `packages/ctrl-s/src/embeddings.ts`, `packages/ctrl-k/src/search.ts`, `packages/ctrl-k/src/embed.ts`, `packages/ctrl-z/src/knowledge-store.ts`, [Plan.md](../Plan.md).
