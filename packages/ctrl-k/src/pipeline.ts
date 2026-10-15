import type {
  Attachment,
  ContextInspect,
  KnowledgeHit,
} from '@involvex/ctrl-s';
import { readBlob } from '@involvex/ctrl-z';
import type { KnowledgeStore } from '@involvex/ctrl-z';
import { chunkText } from './chunk';
import { extractText } from './extract';

export function ingestAttachment(
  knowledge: KnowledgeStore,
  attachment: Attachment
): { chunkCount: number } {
  try {
    const bytes = readBlob(knowledge.blobRoot, attachment.blobPath);
    const extracted = extractText(
      bytes,
      attachment.mimeType,
      attachment.filename
    );
    if (extracted.method === 'unsupported' || extracted.text.length === 0) {
      knowledge.markAttachmentFailed(
        attachment.id,
        extracted.method === 'unsupported'
          ? `unsupported mime: ${attachment.mimeType}`
          : 'empty extraction'
      );
      return { chunkCount: 0 };
    }
    const chunks = chunkText(extracted.text);
    if (chunks.length === 0) {
      knowledge.markAttachmentFailed(attachment.id, 'no chunks produced');
      return { chunkCount: 0 };
    }
    const count = knowledge.replaceChunks(
      attachment.id,
      attachment.workspaceId,
      attachment.filename,
      chunks
    );
    knowledge.markAttachmentReady(attachment.id, count);

    // Seed a pending-review memory from the first chunk for the review UI.
    knowledge.createMemory(attachment.workspaceId, {
      kind: 'note',
      content: `From ${attachment.filename}: ${chunks[0]!.slice(0, 400)}`,
      sourceAttachmentId: attachment.id,
      status: 'pending_review',
    });

    return { chunkCount: count };
  } catch (err) {
    knowledge.markAttachmentFailed(
      attachment.id,
      err instanceof Error ? err.message : String(err)
    );
    return { chunkCount: 0 };
  }
}

export function assembleContextPreview(input: {
  workspaceId: string;
  conversationId: string | null;
  recentMessages: Array<{ role: string; content: string; createdAt: number }>;
  pinnedMemory: ContextInspect['pinnedMemory'];
  knowledgeHits: KnowledgeHit[];
}): ContextInspect {
  const parts: string[] = [];
  if (input.pinnedMemory.length > 0) {
    parts.push('## Pinned memory');
    for (const m of input.pinnedMemory) {
      parts.push(`- (${m.kind}) ${m.content}`);
    }
  }
  if (input.knowledgeHits.length > 0) {
    parts.push('## Knowledge hits');
    for (const hit of input.knowledgeHits) {
      parts.push(`- [${hit.filename}] ${hit.snippet}`);
    }
  }
  if (input.recentMessages.length > 0) {
    parts.push('## Recent messages');
    for (const msg of input.recentMessages) {
      parts.push(`${msg.role}: ${msg.content.slice(0, 500)}`);
    }
  }
  return {
    workspaceId: input.workspaceId,
    conversationId: input.conversationId,
    recentMessages: input.recentMessages,
    pinnedMemory: input.pinnedMemory,
    knowledgeHits: input.knowledgeHits,
    assembledPreview: parts.join('\n'),
  };
}
