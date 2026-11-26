import type {
  ClientBrainChunk,
  ClientBrainMemory,
  ClientBrainState,
} from './brain';

const DEFAULT_CHUNK_CHARS = 1200;
const DEFAULT_CHUNK_OVERLAP = 120;
const MAX_MEMORY_CHARS = 20_000;
const MAX_NOTE_CHARS = 2_000_000;

/** Cap memory content to the host schema limit. */
export function clampMemoryContent(content: string): string {
  if (content.length <= MAX_MEMORY_CHARS) {
    return content;
  }
  return content.slice(0, MAX_MEMORY_CHARS);
}

/** Cap note / attachment text to the host schema limit. */
export function clampNoteText(text: string): string {
  if (text.length <= MAX_NOTE_CHARS) {
    return text;
  }
  return text.slice(0, MAX_NOTE_CHARS);
}

/**
 * Lightweight character-budget chunker (mirrors ctrl-k chunkText without a dep).
 */
export function chunkNoteText(
  text: string,
  opts: { maxChars?: number; overlap?: number } = {}
): string[] {
  const maxChars = opts.maxChars ?? DEFAULT_CHUNK_CHARS;
  const overlap = opts.overlap ?? DEFAULT_CHUNK_OVERLAP;
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
  return chunks.filter((c) => c.length > 0);
}

export type LocalKnowledgeHit = {
  chunkId: string;
  noteId: string;
  filename: string;
  snippet: string;
  score: number;
  source: 'fts';
};

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9#]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

/**
 * Keyword search over replicated / local chunks (offline FTS stand-in).
 */
export function searchLocalChunks(
  chunks: readonly ClientBrainChunk[],
  query: string,
  limit = 8
): LocalKnowledgeHit[] {
  const terms = tokenize(query);
  if (terms.length === 0 || chunks.length === 0) {
    return [];
  }

  const scored: LocalKnowledgeHit[] = [];
  for (const chunk of chunks) {
    const hay = chunk.content.toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (hay.includes(term)) {
        score += 1;
        // Prefer denser matches.
        let from = 0;
        while (from < hay.length) {
          const at = hay.indexOf(term, from);
          if (at < 0) {
            break;
          }
          score += 0.1;
          from = at + term.length;
        }
      }
    }
    if (score <= 0) {
      continue;
    }
    const snippet =
      chunk.content.length > 240
        ? `${chunk.content.slice(0, 240)}…`
        : chunk.content;
    scored.push({
      chunkId: chunk.id,
      noteId: chunk.noteId,
      filename: chunk.filename,
      snippet,
      score,
      source: 'fts',
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

export function listPinnedLocalMemory(
  state: ClientBrainState
): ClientBrainMemory[] {
  return state.memory.filter(
    (m) =>
      m.deletedAt == null &&
      m.pinned &&
      (m.status === 'active' || m.status === 'pending_review')
  );
}

/**
 * Build a prompt prefix from pinned memory + local FTS hits (LiteRT / offline).
 */
export function assembleLocalContextPrefix(
  state: ClientBrainState,
  query: string,
  opts: { hitLimit?: number } = {}
): string {
  const parts: string[] = [];
  const pinned = listPinnedLocalMemory(state);
  if (pinned.length > 0) {
    parts.push('## Pinned memory');
    for (const m of pinned) {
      parts.push(`- (${m.kind}) ${m.content}`);
    }
  }
  const liveNoteIds = new Set(
    state.notes.filter((n) => n.deletedAt == null).map((n) => n.id)
  );
  const liveChunks = state.chunks.filter((c) => liveNoteIds.has(c.noteId));
  const hits = searchLocalChunks(liveChunks, query, opts.hitLimit ?? 6);
  if (hits.length > 0) {
    parts.push('## Knowledge hits');
    for (const hit of hits) {
      parts.push(`- [${hit.filename}] ${hit.snippet}`);
    }
  }
  return parts.join('\n');
}
