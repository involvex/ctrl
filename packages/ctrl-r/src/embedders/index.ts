import type {
  Embedder,
  EmbeddingProviderId,
  ProviderConfig,
} from '@involvex/ctrl-s';
import { createHashEmbedder, hashModelName } from './hash-embedder';
import { OpenAiCompatibleEmbedder } from './openai-embedder';

export {
  createHashEmbedder,
  embedHashText,
  hashModelName,
  type HashEmbedder,
  type HashEmbedderConfig,
} from './hash-embedder';
export {
  OpenAiCompatibleEmbedder,
  type OpenAiCompatibleEmbedderConfig,
} from './openai-embedder';

const DEFAULT_DIMS = 384;
const OPENAI_DEFAULT_MODEL = 'text-embedding-3-small';
const LOCAL_DEFAULT_MODEL = 'local';

function parseDims(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 32 || parsed > 8192) {
    return fallback;
  }
  return Math.floor(parsed);
}

function normalizeProvider(raw: string | undefined): EmbeddingProviderId {
  const value = (raw ?? 'hash').toLowerCase();
  switch (value) {
    case 'off':
    case 'none':
    case 'disabled':
      return 'off';
    case 'openai':
    case 'llama':
    case 'litert':
      return value;
    default:
      return 'hash';
  }
}

/**
 * Resolve the gateway embedder from env.
 *
 * - `CTRL_EMBEDDINGS=off`     → null (FTS only)
 * - `CTRL_EMBEDDINGS=hash`    → deterministic local vectors (default)
 * - `CTRL_EMBEDDINGS=openai`  → OpenAI-compatible endpoint
 * - `CTRL_EMBEDDINGS=llama`   → llama-server embeddings (default :8080/v1)
 * - `CTRL_EMBEDDINGS=litert`  → litert-lm embeddings (default :9379/v1)
 */
export function createEmbedderFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  providerConfig?: ProviderConfig
): Embedder | null {
  const provider = normalizeProvider(env['CTRL_EMBEDDINGS']);

  if (provider === 'off') {
    return null;
  }

  if (provider === 'hash') {
    const dims = parseDims(env['CTRL_EMBEDDINGS_DIM'], DEFAULT_DIMS);
    const model = env['CTRL_EMBEDDINGS_MODEL'] ?? hashModelName(dims);
    return createHashEmbedder({ dims, model });
  }

  const baseUrl = resolveBaseUrl(provider, env, providerConfig);
  const apiKey = resolveApiKey(provider, env);
  const model = env['CTRL_EMBEDDINGS_MODEL'] ?? defaultModel(provider);
  const dims = parseDims(
    env['CTRL_EMBEDDINGS_DIM'],
    provider === 'openai' ? 1536 : 768
  );

  if (provider === 'openai' && !apiKey) {
    process.stderr.write(
      '[ctrl-r] CTRL_EMBEDDINGS=openai without an API key — falling back to local hash embeddings\n'
    );
    return createHashEmbedder({
      dims: DEFAULT_DIMS,
      model: hashModelName(DEFAULT_DIMS),
    });
  }

  return new OpenAiCompatibleEmbedder({
    id: provider,
    baseUrl,
    model,
    dims,
    ...(apiKey ? { apiKey } : {}),
  });
}

function defaultModel(
  provider: Exclude<EmbeddingProviderId, 'off' | 'hash'>
): string {
  return provider === 'openai' ? OPENAI_DEFAULT_MODEL : LOCAL_DEFAULT_MODEL;
}

function resolveApiKey(
  provider: Exclude<EmbeddingProviderId, 'off' | 'hash'>,
  env: NodeJS.ProcessEnv
): string | undefined {
  const explicit = env['CTRL_EMBEDDINGS_API_KEY'];
  if (explicit) {
    return explicit;
  }
  if (provider === 'openai') {
    return env['CTRL_OPENAI_API_KEY'] ?? env['OPENAI_API_KEY'];
  }
  // Local servers usually ignore auth but some require a placeholder key.
  return env['CTRL_OPENAI_API_KEY'] ?? env['OPENAI_API_KEY'] ?? 'local';
}

function resolveBaseUrl(
  provider: Exclude<EmbeddingProviderId, 'off' | 'hash'>,
  env: NodeJS.ProcessEnv,
  providerConfig?: ProviderConfig
): string {
  const explicit = env['CTRL_EMBEDDINGS_BASE_URL'];
  if (explicit) {
    return explicit;
  }
  if (provider === 'openai') {
    return (
      env['CTRL_OPENAI_BASE_URL'] ??
      env['OPENAI_BASE_URL'] ??
      providerConfig?.openai.baseUrl ??
      'https://api.openai.com/v1'
    );
  }
  if (provider === 'llama') {
    return (
      env['CTRL_LLAMA_BASE_URL'] ??
      env['CTRL_OPENAI_BASE_URL'] ??
      providerConfig?.llama.baseUrl ??
      'http://127.0.0.1:8080/v1'
    );
  }
  return (
    env['CTRL_LITERT_LM_BASE_URL'] ??
    providerConfig?.litert.baseUrl ??
    'http://127.0.0.1:9379/v1'
  );
}
