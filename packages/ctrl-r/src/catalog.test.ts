import { describe, expect, test } from 'bun:test';
import { listHfModelCatalog } from './catalog';

describe('HF model catalog', () => {
  test('every entry has a pinned huggingface GGUF URL and filename', () => {
    const items = listHfModelCatalog();
    expect(items.length).toBeGreaterThan(0);
    for (const entry of items) {
      expect(entry.downloadUrl.startsWith('https://huggingface.co/')).toBe(
        true
      );
      expect(entry.downloadUrl.includes('/resolve/')).toBe(true);
      expect(entry.filename.endsWith('.gguf')).toBe(true);
      expect(
        entry.filename.includes('/') || entry.filename.includes('\\')
      ).toBe(false);
      expect(entry.downloadUrl.endsWith(entry.filename)).toBe(true);
    }
  });
});
