import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Embedder } from '@involvex/ctrl-s';
import { KnowledgeStore, Store, openDatabase } from '@involvex/ctrl-z';
import { reindexWorkspaceVectors } from './embed';
import {
  buildSnippet,
  cosineSimilarity,
  searchKnowledgeHybrid,
} from './search';

const VOCAB = ['coolant', 'pump', 'reactor', 'moss', 'tank'];

/** Tiny deterministic embedder: keyword presence per dimension. */
function vectorFor(text: string): number[] {
  const lower = text.toLowerCase();
  return VOCAB.map((word) => (lower.includes(word) ? 1 : 0));
}

const embedder: Embedder = {
  id: 'hash',
  model: 'test-keywords',
  dims: VOCAB.length,
  embed: (texts) => Promise.resolve(texts.map(vectorFor)),
};

const CHUNK_A = 'The coolant pump primes the reactor before ignition.';
const CHUNK_B = 'Moss grows inside the recovery tank.';

let cleanup: (() => void) | null = null;

afterEach(() => {
  cleanup?.();
  cleanup = null;
});

function fixture(): {
  knowledge: KnowledgeStore;
  workspaceId: string;
  attachmentId: string;
} {
  const root = mkdtempSync(path.join(tmpdir(), 'ctrl-k-search-'));
  const db = openDatabase(path.join(root, 'app.db'));
  const store = new Store(db);
  const knowledge = new KnowledgeStore(db, path.join(root, 'blobs'));
  const workspace = store.createWorkspace('search-ws');
  const attachment = knowledge.createAttachment(
    workspace.id,
    { filename: 'manual.md', mimeType: 'text/markdown' },
    new TextEncoder().encode('x')
  );
  const chunks = knowledge.replaceChunks(
    attachment.id,
    workspace.id,
    attachment.filename,
    [CHUNK_A, CHUNK_B]
  );
  knowledge.markAttachmentReady(attachment.id, chunks.length);
  cleanup = () => {
    db.close();
    rmSync(root, { recursive: true, force: true });
  };
  return {
    knowledge,
    workspaceId: workspace.id,
    attachmentId: attachment.id,
  };
}

describe('cosineSimilarity', () => {
  test('identical, orthogonal and zero vectors', () => {
    expect(
      cosineSimilarity(Float32Array.from([1, 0]), Float32Array.from([1, 0]))
    ).toBeCloseTo(1);
    expect(
      cosineSimilarity(Float32Array.from([1, 0]), Float32Array.from([0, 1]))
    ).toBeCloseTo(0);
    expect(
      cosineSimilarity(Float32Array.from([0, 0]), Float32Array.from([1, 1]))
    ).toBe(0);
  });
});

describe('buildSnippet', () => {
  test('centers on the first matching query term', () => {
    const content = `${'filler '.repeat(60)}coolant pump ${'tail '.repeat(60)}`;
    const snippet = buildSnippet(content, 'pump');
    expect(snippet).toContain('coolant');
    expect(snippet.startsWith('…')).toBe(true);
    expect(snippet.endsWith('…')).toBe(true);
  });

  test('returns the whole chunk when it is short', () => {
    expect(buildSnippet(CHUNK_A, 'coolant')).toBe(CHUNK_A);
  });
});

describe('searchKnowledgeHybrid', () => {
  test('reindexes chunks into vectors, then skips them on a second pass', async () => {
    const { knowledge, workspaceId } = fixture();

    const first = await reindexWorkspaceVectors(
      knowledge,
      embedder,
      workspaceId
    );
    expect(first.indexed).toBe(2);
    expect(first.totalChunks).toBe(2);
    expect(first.indexedChunks).toBe(2);

    const second = await reindexWorkspaceVectors(
      knowledge,
      embedder,
      workspaceId
    );
    expect(second.indexed).toBe(0);
    expect(second.skipped).toBe(0);
  });

  test('vector mode ranks by cosine similarity', async () => {
    const { knowledge, workspaceId } = fixture();
    await reindexWorkspaceVectors(knowledge, embedder, workspaceId);

    const hits = await searchKnowledgeHybrid(
      knowledge,
      embedder,
      workspaceId,
      'pump coolant',
      { mode: 'vector' }
    );
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.snippet).toContain('coolant pump');
    expect(hits[0]?.source).toBe('vector');
    expect(hits[0]?.score).toBeGreaterThan(0);
  });

  test('hybrid mode fuses keyword and vector rankings', async () => {
    const { knowledge, workspaceId } = fixture();
    await reindexWorkspaceVectors(knowledge, embedder, workspaceId);

    const hits = await searchKnowledgeHybrid(
      knowledge,
      embedder,
      workspaceId,
      'coolant pump'
    );
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.source).toBe('hybrid');
    expect(hits[0]?.snippet).toContain('coolant');
  });

  test('fts mode and missing embedder degrade to keyword search', async () => {
    const { knowledge, workspaceId } = fixture();

    const fts = await searchKnowledgeHybrid(
      knowledge,
      embedder,
      workspaceId,
      'reactor',
      { mode: 'fts' }
    );
    expect(fts.length).toBe(1);
    expect(fts[0]?.source).toBe('fts');

    const noEmbedder = await searchKnowledgeHybrid(
      knowledge,
      null,
      workspaceId,
      'tank'
    );
    expect(noEmbedder.length).toBe(1);
    expect(noEmbedder[0]?.source).toBe('fts');
  });

  test('vector mode returns nothing before chunks are embedded', async () => {
    const { knowledge, workspaceId } = fixture();
    const hits = await searchKnowledgeHybrid(
      knowledge,
      embedder,
      workspaceId,
      'coolant',
      { mode: 'vector' }
    );
    expect(hits).toEqual([]);
  });
});
