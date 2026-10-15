import { describe, expect, test } from 'bun:test';
import {
  createMemory,
  createWorkspace,
  inspectContext,
  listMemory,
  searchKnowledge,
  updateMemory,
  uploadAttachmentText,
} from '@involvex/ctrl-i';
import { baseUrl } from './env';

describe('contract: knowledge + memory', () => {
  test('upload text attachment → FTS hit → memory review', async () => {
    const ws = await createWorkspace(baseUrl(), 'knowledge-ws');
    const attachment = await uploadAttachmentText(baseUrl(), ws.id, {
      filename: 'project-notes.md',
      mimeType: 'text/markdown',
      text: [
        '# Project ctrl',
        '',
        'The neon moss reactor uses accent color #00ff66.',
        'Personal knowledge uses FTS before vector search.',
        'Memory review lets humans approve extracted notes.',
      ].join('\n'),
    });
    expect(attachment.status).toBe('ready');
    expect(attachment.chunkCount).toBeGreaterThan(0);

    const hits = await searchKnowledge(baseUrl(), ws.id, 'neon moss');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.filename).toBe('project-notes.md');
    expect(hits[0]?.snippet.toLowerCase()).toContain('moss');

    const pending = await listMemory(baseUrl(), ws.id, 'pending_review');
    expect(pending.length).toBeGreaterThan(0);
    const reviewed = await updateMemory(baseUrl(), pending[0]!.id, {
      status: 'active',
      pinned: true,
    });
    expect(reviewed.status).toBe('active');
    expect(reviewed.pinned).toBe(true);

    const note = await createMemory(baseUrl(), ws.id, {
      kind: 'preference',
      content: 'Prefer FTS snippets in the context inspector.',
      status: 'active',
      pinned: true,
    });
    expect(note.kind).toBe('preference');

    const ctx = await inspectContext(baseUrl(), ws.id, { q: 'vector search' });
    expect(ctx.pinnedMemory.some((m) => m.pinned)).toBe(true);
    expect(ctx.knowledgeHits.length).toBeGreaterThan(0);
    expect(ctx.assembledPreview).toContain('Knowledge hits');
  });
});
