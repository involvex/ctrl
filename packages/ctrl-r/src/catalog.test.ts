import { describe, expect, test } from 'bun:test';
import { listHfModelCatalog, resolveHfModelQuant } from './catalog';

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
      expect(entry.defaultQuant.length).toBeGreaterThan(0);
      expect(entry.quantizations.length).toBeGreaterThan(1);
      expect(entry.quantizations.some((q) => q.id === entry.defaultQuant)).toBe(
        true
      );
      for (const quant of entry.quantizations) {
        expect(quant.downloadUrl.startsWith('https://huggingface.co/')).toBe(
          true
        );
        expect(quant.downloadUrl.endsWith(quant.filename)).toBe(true);
        expect(quant.filename.endsWith('.gguf')).toBe(true);
        expect(quant.filename).toContain(quant.id);
      }
    }
  });

  test('resolveHfModelQuant picks requested quant or falls back to default', () => {
    const entry = listHfModelCatalog()[0]!;
    const def = resolveHfModelQuant(entry);
    expect(def.id).toBe(entry.defaultQuant);
    expect(def.filename).toBe(entry.filename);

    const other = entry.quantizations.find((q) => q.id !== entry.defaultQuant)!;
    const resolved = resolveHfModelQuant(entry, other.id);
    expect(resolved.id).toBe(other.id);
    expect(resolved.downloadUrl).toBe(other.downloadUrl);

    const missing = resolveHfModelQuant(entry, 'NOT_A_REAL_QUANT');
    expect(missing.id).toBe(entry.defaultQuant);
  });
});
