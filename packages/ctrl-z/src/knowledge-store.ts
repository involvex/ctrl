import type { Database } from 'bun:sqlite';
import {
  attachmentSchema,
  knowledgeHitSchema,
  memoryItemSchema,
  type Attachment,
  type CreateAttachmentInput,
  type CreateMemoryInput,
  type KnowledgeChunk,
  type KnowledgeHit,
  type MemoryItem,
  type MemoryStatus,
  type UpdateMemoryInput,
} from '@involvex/ctrl-s';
import { resolveBlobRoot, writeBlob } from './blobs';

function id(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`;
}

type AttachmentRow = {
  id: string;
  workspace_id: string;
  conversation_id: string | null;
  filename: string;
  mime_type: string;
  size_bytes: number;
  blob_path: string;
  status: string;
  error: string | null;
  chunk_count: number;
  created_at: number;
};

type MemoryRow = {
  id: string;
  workspace_id: string;
  kind: string;
  content: string;
  source_attachment_id: string | null;
  pinned: number;
  status: string;
  created_at: number;
  updated_at: number;
};

type ChunkRow = {
  id: string;
  attachment_id: string;
  workspace_id: string;
  chunk_index: number;
  content: string;
  created_at: number;
};

type VectorRow = {
  chunk_id: string;
  attachment_id: string;
  model: string;
  dim: number;
  vector: Uint8Array;
  content: string;
  chunk_index: number;
  filename: string;
};

/** Vector row joined with chunk text — used by in-process similarity search. */
export type StoredVector = {
  chunkId: string;
  attachmentId: string;
  workspaceId: string;
  model: string;
  dim: number;
  filename: string;
  content: string;
  chunkIndex: number;
  vector: Float32Array;
};

function blobToFloat32(bytes: Uint8Array): Float32Array {
  // Copy so the Float32Array starts at offset 0 and is 4-byte aligned.
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Float32Array(copy.buffer, 0, copy.byteLength / 4);
}

function mapAttachment(row: AttachmentRow): Attachment {
  return attachmentSchema.parse({
    id: row.id,
    workspaceId: row.workspace_id,
    conversationId: row.conversation_id,
    filename: row.filename,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    blobPath: row.blob_path,
    status: row.status,
    error: row.error,
    chunkCount: row.chunk_count,
    createdAt: row.created_at,
  });
}

function mapMemory(row: MemoryRow): MemoryItem {
  return memoryItemSchema.parse({
    id: row.id,
    workspaceId: row.workspace_id,
    kind: row.kind,
    content: row.content,
    sourceAttachmentId: row.source_attachment_id,
    pinned: row.pinned === 1,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

/** Escape FTS5 query operators for safe MATCH. */
export function sanitizeFtsQuery(raw: string): string {
  let cleaned = '';
  for (let i = 0; i < raw.length; i++) {
    const ch = raw.charAt(i);
    cleaned += '"*(){}[]^:'.includes(ch) ? ' ' : ch;
  }
  const tokens = cleaned
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  if (tokens.length === 0) {
    return '""';
  }
  return tokens.map((t) => `"${t}"`).join(' AND ');
}

export class KnowledgeStore {
  readonly blobRoot: string;

  constructor(
    private readonly db: Database,
    blobRoot?: string
  ) {
    this.blobRoot = blobRoot ?? resolveBlobRoot();
  }

  createAttachment(
    workspaceId: string,
    input: CreateAttachmentInput,
    bytes: Uint8Array
  ): Attachment {
    const now = Date.now();
    const attachmentId = id('att');
    const mimeType = input.mimeType ?? guessMime(input.filename);
    const blobPath = writeBlob(
      this.blobRoot,
      workspaceId,
      attachmentId,
      input.filename,
      bytes
    );
    const row: Attachment = attachmentSchema.parse({
      id: attachmentId,
      workspaceId,
      conversationId: input.conversationId ?? null,
      filename: input.filename,
      mimeType,
      sizeBytes: bytes.byteLength,
      blobPath,
      status: 'pending',
      error: null,
      chunkCount: 0,
      createdAt: now,
    });
    this.db
      .query(
        `INSERT INTO attachments(
          id, workspace_id, conversation_id, filename, mime_type, size_bytes,
          blob_path, status, error, chunk_count, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        row.id,
        row.workspaceId,
        row.conversationId,
        row.filename,
        row.mimeType,
        row.sizeBytes,
        row.blobPath,
        row.status,
        row.error,
        row.chunkCount,
        row.createdAt
      );
    return row;
  }

  getAttachment(attachmentId: string): Attachment | null {
    const row = this.db
      .query<AttachmentRow, [string]>(
        `SELECT id, workspace_id, conversation_id, filename, mime_type, size_bytes,
                blob_path, status, error, chunk_count, created_at
         FROM attachments WHERE id = ?`
      )
      .get(attachmentId);
    return row ? mapAttachment(row) : null;
  }

  listAttachments(workspaceId: string): Attachment[] {
    const rows = this.db
      .query<AttachmentRow, [string]>(
        `SELECT id, workspace_id, conversation_id, filename, mime_type, size_bytes,
                blob_path, status, error, chunk_count, created_at
         FROM attachments WHERE workspace_id = ?
         ORDER BY created_at DESC`
      )
      .all(workspaceId);
    return rows.map(mapAttachment);
  }

  markAttachmentReady(attachmentId: string, chunkCount: number): void {
    this.db
      .query(
        `UPDATE attachments SET status = 'ready', error = NULL, chunk_count = ?
         WHERE id = ?`
      )
      .run(chunkCount, attachmentId);
  }

  markAttachmentFailed(attachmentId: string, error: string): void {
    this.db
      .query(
        `UPDATE attachments SET status = 'failed', error = ?, chunk_count = 0
         WHERE id = ?`
      )
      .run(error, attachmentId);
  }

  replaceChunks(
    attachmentId: string,
    workspaceId: string,
    filename: string,
    chunks: string[]
  ): KnowledgeChunk[] {
    this.db
      .query(
        `DELETE FROM knowledge_fts WHERE chunk_id IN (
           SELECT id FROM knowledge_chunks WHERE attachment_id = ?
         )`
      )
      .run(attachmentId);
    this.db
      .query('DELETE FROM knowledge_chunks WHERE attachment_id = ?')
      .run(attachmentId);

    const now = Date.now();
    const stored: KnowledgeChunk[] = [];
    let index = 0;
    for (const content of chunks) {
      const chunk: KnowledgeChunk = {
        id: id('chk'),
        attachmentId,
        workspaceId,
        chunkIndex: index,
        content,
        createdAt: now,
      };
      this.db
        .query(
          `INSERT INTO knowledge_chunks(
            id, attachment_id, workspace_id, chunk_index, content, created_at
          ) VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(
          chunk.id,
          chunk.attachmentId,
          chunk.workspaceId,
          chunk.chunkIndex,
          chunk.content,
          chunk.createdAt
        );
      this.db
        .query(
          `INSERT INTO knowledge_fts(content, chunk_id, workspace_id, filename)
           VALUES (?, ?, ?, ?)`
        )
        .run(content, chunk.id, workspaceId, filename);
      stored.push(chunk);
      index += 1;
    }
    return stored;
  }

  /**
   * Persist an embedding for a chunk.
   * Vectors are stored as raw little-endian float32 blobs.
   */
  upsertChunkVector(input: {
    chunkId: string;
    workspaceId: string;
    attachmentId: string;
    model: string;
    vector: Float32Array;
  }): void {
    const bytes = Buffer.from(
      input.vector.buffer,
      input.vector.byteOffset,
      input.vector.byteLength
    );
    this.db
      .query(
        `INSERT INTO knowledge_vectors(
           chunk_id, workspace_id, attachment_id, model, dim, vector, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(chunk_id) DO UPDATE SET
           workspace_id = excluded.workspace_id,
           attachment_id = excluded.attachment_id,
           model = excluded.model,
           dim = excluded.dim,
           vector = excluded.vector,
           created_at = excluded.created_at`
      )
      .run(
        input.chunkId,
        input.workspaceId,
        input.attachmentId,
        input.model,
        input.vector.length,
        bytes,
        Date.now()
      );
  }

  deleteVectorsForAttachment(attachmentId: string): void {
    this.db
      .query('DELETE FROM knowledge_vectors WHERE attachment_id = ?')
      .run(attachmentId);
  }

  /** Vectors joined with chunk text and source filename, for in-process search. */
  listVectors(workspaceId: string, model?: string): StoredVector[] {
    const rows = model
      ? this.db
          .query<VectorRow, [string, string]>(
            `SELECT v.chunk_id, v.attachment_id, v.model, v.dim, v.vector,
                    c.content, c.chunk_index, a.filename
             FROM knowledge_vectors v
             JOIN knowledge_chunks c ON c.id = v.chunk_id
             JOIN attachments a ON a.id = v.attachment_id
             WHERE v.workspace_id = ? AND v.model = ?`
          )
          .all(workspaceId, model)
      : this.db
          .query<VectorRow, [string]>(
            `SELECT v.chunk_id, v.attachment_id, v.model, v.dim, v.vector,
                    c.content, c.chunk_index, a.filename
             FROM knowledge_vectors v
             JOIN knowledge_chunks c ON c.id = v.chunk_id
             JOIN attachments a ON a.id = v.attachment_id
             WHERE v.workspace_id = ?`
          )
          .all(workspaceId);

    return rows.map((row) => ({
      chunkId: row.chunk_id,
      attachmentId: row.attachment_id,
      workspaceId,
      model: row.model,
      dim: row.dim,
      filename: row.filename,
      content: row.content,
      chunkIndex: row.chunk_index,
      vector: blobToFloat32(row.vector),
    }));
  }

  countChunks(workspaceId: string): number {
    const row = this.db
      .query<{ count: number }, [string]>(
        'SELECT COUNT(*) AS count FROM knowledge_chunks WHERE workspace_id = ?'
      )
      .get(workspaceId);
    return row?.count ?? 0;
  }

  countVectors(workspaceId: string, model?: string): number {
    const row = model
      ? this.db
          .query<{ count: number }, [string, string]>(
            `SELECT COUNT(*) AS count FROM knowledge_vectors
             WHERE workspace_id = ? AND model = ?`
          )
          .get(workspaceId, model)
      : this.db
          .query<{ count: number }, [string]>(
            `SELECT COUNT(*) AS count FROM knowledge_vectors
             WHERE workspace_id = ?`
          )
          .get(workspaceId);
    return row?.count ?? 0;
  }

  /**
   * Chunks without a vector for `model` (or every chunk when `force`).
   */
  listChunksNeedingVectors(
    workspaceId: string,
    model: string,
    opts: { force?: boolean; limit?: number } = {}
  ): KnowledgeChunk[] {
    const limit = opts.limit ?? 256;
    const rows = opts.force
      ? this.db
          .query<ChunkRow, [string, number]>(
            `SELECT id, attachment_id, workspace_id, chunk_index, content, created_at
             FROM knowledge_chunks
             WHERE workspace_id = ?
             ORDER BY created_at, chunk_index
             LIMIT ?`
          )
          .all(workspaceId, limit)
      : this.db
          .query<ChunkRow, [string, string, number]>(
            `SELECT c.id, c.attachment_id, c.workspace_id, c.chunk_index,
                    c.content, c.created_at
             FROM knowledge_chunks c
             LEFT JOIN knowledge_vectors v
               ON v.chunk_id = c.id AND v.model = ?
             WHERE c.workspace_id = ? AND v.chunk_id IS NULL
             ORDER BY c.created_at, c.chunk_index
             LIMIT ?`
          )
          .all(model, workspaceId, limit);

    return rows.map((row) => ({
      id: row.id,
      attachmentId: row.attachment_id,
      workspaceId: row.workspace_id,
      chunkIndex: row.chunk_index,
      content: row.content,
      createdAt: row.created_at,
    }));
  }

  searchKnowledge(
    workspaceId: string,
    query: string,
    limit = 8
  ): KnowledgeHit[] {
    const match = sanitizeFtsQuery(query);
    if (match === '""') {
      return [];
    }
    const rows = this.db
      .query<
        {
          chunk_id: string;
          filename: string;
          snippet: string;
          rank: number;
          attachment_id: string;
          workspace_id: string;
        },
        [string, string, number]
      >(
        `SELECT
           f.chunk_id AS chunk_id,
           f.filename AS filename,
           snippet(knowledge_fts, 0, '«', '»', '…', 24) AS snippet,
           bm25(knowledge_fts) AS rank,
           c.attachment_id AS attachment_id,
           f.workspace_id AS workspace_id
         FROM knowledge_fts f
         JOIN knowledge_chunks c ON c.id = f.chunk_id
         WHERE knowledge_fts MATCH ? AND f.workspace_id = ?
         ORDER BY rank
         LIMIT ?`
      )
      .all(match, workspaceId, limit);

    return rows.map((row) =>
      knowledgeHitSchema.parse({
        chunkId: row.chunk_id,
        attachmentId: row.attachment_id,
        workspaceId: row.workspace_id,
        filename: row.filename,
        snippet: row.snippet,
        rank: row.rank,
        source: 'fts',
      })
    );
  }

  listMemory(
    workspaceId: string,
    opts?: { status?: MemoryStatus }
  ): MemoryItem[] {
    if (opts?.status) {
      const rows = this.db
        .query<MemoryRow, [string, string]>(
          `SELECT id, workspace_id, kind, content, source_attachment_id, pinned,
                  status, created_at, updated_at
           FROM memory_items
           WHERE workspace_id = ? AND status = ?
           ORDER BY pinned DESC, updated_at DESC`
        )
        .all(workspaceId, opts.status);
      return rows.map(mapMemory);
    }
    const rows = this.db
      .query<MemoryRow, [string]>(
        `SELECT id, workspace_id, kind, content, source_attachment_id, pinned,
                status, created_at, updated_at
         FROM memory_items
         WHERE workspace_id = ?
         ORDER BY pinned DESC, updated_at DESC`
      )
      .all(workspaceId);
    return rows.map(mapMemory);
  }

  createMemory(workspaceId: string, input: CreateMemoryInput): MemoryItem {
    const now = Date.now();
    const item = memoryItemSchema.parse({
      id: id('mem'),
      workspaceId,
      kind: input.kind ?? 'note',
      content: input.content,
      sourceAttachmentId: input.sourceAttachmentId ?? null,
      pinned: input.pinned ?? false,
      status: input.status ?? 'pending_review',
      createdAt: now,
      updatedAt: now,
    });
    this.db
      .query(
        `INSERT INTO memory_items(
          id, workspace_id, kind, content, source_attachment_id, pinned,
          status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        item.id,
        item.workspaceId,
        item.kind,
        item.content,
        item.sourceAttachmentId,
        item.pinned ? 1 : 0,
        item.status,
        item.createdAt,
        item.updatedAt
      );
    return item;
  }

  updateMemory(memoryId: string, input: UpdateMemoryInput): MemoryItem | null {
    const existing = this.getMemory(memoryId);
    if (!existing) {
      return null;
    }
    const next = memoryItemSchema.parse({
      ...existing,
      content: input.content ?? existing.content,
      kind: input.kind ?? existing.kind,
      pinned: input.pinned ?? existing.pinned,
      status: input.status ?? existing.status,
      updatedAt: Date.now(),
    });
    this.db
      .query(
        `UPDATE memory_items
         SET kind = ?, content = ?, pinned = ?, status = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(
        next.kind,
        next.content,
        next.pinned ? 1 : 0,
        next.status,
        next.updatedAt,
        next.id
      );
    return next;
  }

  getMemory(memoryId: string): MemoryItem | null {
    const row = this.db
      .query<MemoryRow, [string]>(
        `SELECT id, workspace_id, kind, content, source_attachment_id, pinned,
                status, created_at, updated_at
         FROM memory_items WHERE id = ?`
      )
      .get(memoryId);
    return row ? mapMemory(row) : null;
  }

  listPinnedMemory(workspaceId: string): MemoryItem[] {
    const rows = this.db
      .query<MemoryRow, [string]>(
        `SELECT id, workspace_id, kind, content, source_attachment_id, pinned,
                status, created_at, updated_at
         FROM memory_items
         WHERE workspace_id = ? AND pinned = 1 AND status = 'active'
         ORDER BY updated_at DESC`
      )
      .all(workspaceId);
    return rows.map(mapMemory);
  }
}

function guessMime(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.md')) {
    return 'text/markdown';
  }
  if (lower.endsWith('.json')) {
    return 'application/json';
  }
  if (lower.endsWith('.txt') || lower.endsWith('.log')) {
    return 'text/plain';
  }
  if (lower.endsWith('.csv')) {
    return 'text/csv';
  }
  return 'application/octet-stream';
}
