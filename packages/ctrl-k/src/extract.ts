/**
 * Phase 4 extractors — text-first. Binary formats can be added later.
 */
export type ExtractResult = {
  text: string;
  method: 'utf8' | 'unsupported';
};

export function extractText(
  bytes: Uint8Array,
  mimeType: string,
  filename: string
): ExtractResult {
  const mime = mimeType.toLowerCase();
  const name = filename.toLowerCase();
  const textual =
    mime.startsWith('text/') ||
    mime === 'application/json' ||
    mime === 'application/xml' ||
    name.endsWith('.md') ||
    name.endsWith('.txt') ||
    name.endsWith('.csv') ||
    name.endsWith('.json') ||
    name.endsWith('.log');

  if (!textual) {
    return { text: '', method: 'unsupported' };
  }

  const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  return { text: normalizeText(text), method: 'utf8' };
}

function normalizeText(text: string): string {
  return text.replaceAll('\r\n', '\n').replaceAll('\r', '\n').trim();
}
