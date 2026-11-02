import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Embedder } from '@involvex/ctrl-s';
import { KnowledgeStore, Store, openDatabase } from '@involvex/ctrl-z';
import { reindexWorkspaceVectors } from '../embed';
import { clearKnowledgeIndexCache, searchKnowledgeHybrid } from '../search';

const VOCAB = ['coolant', 'pump', 'reactor', 'moss', 'tank'];

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

let cleanup: (() => void) | null = null;

afterEach(() => {
  cleanup?.();
  cleanup = null;
  clearKnowledgeIndexCache();
  delete process.env['CTRL_KNOWLEDGE_ANN_THRESHOLD'];
});

describe('ANN cache', () => {
  test('clearKnowledgeIndexCache empties cache for a workspace', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'ctrl-k-ann-'));
    const db = openDatabase(path.join(root, 'app.db'));
    cleanup = () => {
      try {
        db.close();
      } catch {
        // ignore
      }
      rmSync(root, { recursive: true, force: true });
    };
    const store = new Store(db);
    const knowledge = new KnowledgeStore(db, path.join(root, 'blobs'));
    const workspace = store.createWorkspace('ann-ws');
    const attachment = knowledge.createAttachment(
      workspace.id,
      { filename: 'manual.md', mimeType: 'text/markdown' },
      new TextEncoder().encode('x')
    );
    const chunks = [
      'The coolant pump primes the reactor before ignition.',
      'Moss grows inside the recovery tank.',
    ];
    knowledge.replaceChunks(
      attachment.id,
      workspace.id,
      attachment.filename,
      chunks
    );
    await reindexWorkspaceVectors(knowledge, embedder, workspace.id, {
      force: true,
    });

    // Force ANN path by lowering threshold to 0.
    process.env['CTRL_KNOWLEDGE_ANN_THRESHOLD'] = '0';
    const hits1 = await searchKnowledgeHybrid(
      knowledge,
      embedder,
      workspace.id,
      'coolant pump',
      { mode: 'vector', limit: 5 }
    );
    expect(hits1.length).toBeGreaterThan(0);

    clearKnowledgeIndexCache(workspace.id);

    const hits2 = await searchKnowledgeHybrid(
      knowledge,
      embedder,
      workspace.id,
      'coolant pump',
      { mode: 'vector', limit: 5 }
    );
    expect(hits2.length).toBeGreaterThan(0);
  });

  test('threshold env switches between brute-force and ANN', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'ctrl-k-ann2-'));
    const db = openDatabase(path.join(root, 'app.db'));
    cleanup = () => {
      try {
        db.close();
      } catch {
        // ignore
      }
      rmSync(root, { recursive: true, force: true });
    };
    const store = new Store(db);
    const knowledge = new KnowledgeStore(db, path.join(root, 'blobs'));
    const workspace = store.createWorkspace('ann-ws2');
    const attachment = knowledge.createAttachment(
      workspace.id,
      { filename: 'manual.md', mimeType: 'text/markdown' },
      new TextEncoder().encode('x')
    );
    knowledge.replaceChunks(attachment.id, workspace.id, attachment.filename, [
      'The coolant pump primes the reactor before ignition.',
    ]);
    await reindexWorkspaceVectors(knowledge, embedder, workspace.id, {
      force: true,
    });

    process.env['CTRL_KNOWLEDGE_ANN_THRESHOLD'] = '100000';
    const hits = await searchKnowledgeHybrid(
      knowledge,
      embedder,
      workspace.id,
      'coolant',
      { mode: 'vector', limit: 5 }
    );
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.source).toBe('vector');
  });
});
