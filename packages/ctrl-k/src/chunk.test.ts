import { describe, expect, test } from 'bun:test';
import { chunkText } from './chunk';

describe('chunkText', () => {
  test('returns single chunk for short text', () => {
    expect(chunkText('hello world')).toEqual(['hello world']);
  });

  test('splits long text under maxChars', () => {
    const text = Array.from(
      { length: 40 },
      (_, i) => `Paragraph ${i}.\n\n`
    ).join('');
    const chunks = chunkText(text, { maxChars: 200, overlap: 20 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeGreaterThan(0);
    }
  });
});
