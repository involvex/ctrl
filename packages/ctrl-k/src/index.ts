export { extractText, type ExtractResult } from './extract';
export { chunkText, type ChunkOptions } from './chunk';
export {
  ingestAttachment,
  assembleContextPreview,
  type IngestOptions,
  type IngestResult,
} from './pipeline';
export { embedChunks, reindexWorkspaceVectors } from './embed';
export {
  cosineSimilarity,
  buildSnippet,
  searchKnowledgeHybrid,
  clearKnowledgeIndexCache,
  type KnowledgeSearchOptions,
} from './search';
export { HnswIndex } from './ann';
