export type ChunkOptions = {
  maxChars?: number;
  overlap?: number;
};

/**
 * Character-budget chunker with paragraph preference and overlap.
 * FTS comes before embeddings in Phase 4 — chunks stay readable.
 */
export function chunkText(text: string, opts: ChunkOptions = {}): string[] {
  const maxChars = opts.maxChars ?? 1200;
  const overlap = opts.overlap ?? 120;
  const cleaned = text.trim();
  if (!cleaned) {
    return [];
  }
  if (cleaned.length <= maxChars) {
    return [cleaned];
  }

  const paragraphs = cleaned.split(/\n{2,}/);
  const chunks: string[] = [];
  let buffer = '';

  const flush = (): void => {
    const piece = buffer.trim();
    if (piece.length > 0) {
      chunks.push(piece);
    }
    buffer = '';
  };

  for (const paragraph of paragraphs) {
    const next = buffer.length === 0 ? paragraph : `${buffer}\n\n${paragraph}`;
    if (next.length <= maxChars) {
      buffer = next;
      continue;
    }
    if (buffer.length > 0) {
      flush();
    }
    if (paragraph.length <= maxChars) {
      buffer = paragraph;
      continue;
    }
    // Hard-split long paragraphs
    let offset = 0;
    while (offset < paragraph.length) {
      const end = Math.min(offset + maxChars, paragraph.length);
      chunks.push(paragraph.slice(offset, end).trim());
      if (end >= paragraph.length) {
        break;
      }
      offset = Math.max(end - overlap, offset + 1);
    }
    buffer = '';
  }
  flush();

  if (overlap <= 0 || chunks.length <= 1) {
    return chunks.filter((c) => c.length > 0);
  }

  // Soft overlap between consecutive chunks when not already overlapping
  const withOverlap: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const current = chunks[i]!;
    if (i === 0) {
      withOverlap.push(current);
      continue;
    }
    const prev = chunks[i - 1]!;
    const tail = prev.slice(Math.max(0, prev.length - overlap));
    withOverlap.push(`${tail}\n${current}`.trim());
  }
  return withOverlap;
}
