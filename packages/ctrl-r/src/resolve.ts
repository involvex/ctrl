import { MockProvider } from './mock-provider';
import { OpenAICompatibleProvider } from './openai-compatible';
import type { ModelProvider } from './types';

/**
 * Resolve the active chat provider from env.
 *
 * - `CTRL_PROVIDER=mock` (default) → MockProvider
 * - `CTRL_PROVIDER=openai` / `llama` or set `CTRL_OPENAI_API_KEY` → OpenAI-compatible
 * - Local llama-server is started by ctrl-a via `CTRL_LLAMA_BIN`, then pointed here
 */
export function resolveProvider(
  env: NodeJS.ProcessEnv = process.env
): ModelProvider {
  const explicit = (env['CTRL_PROVIDER'] ?? '').toLowerCase();
  const apiKey = env['CTRL_OPENAI_API_KEY'] ?? env['OPENAI_API_KEY'];

  if (explicit === 'mock' || (!explicit && !apiKey)) {
    return new MockProvider();
  }

  if (
    explicit === 'openai' ||
    explicit === 'openai-compatible' ||
    explicit === 'llama' ||
    apiKey
  ) {
    if (!apiKey) {
      throw new Error(
        'CTRL_OPENAI_API_KEY (or OPENAI_API_KEY) required for openai/llama provider'
      );
    }
    return new OpenAICompatibleProvider({
      apiKey,
      baseUrl: env['CTRL_OPENAI_BASE_URL'] ?? env['OPENAI_BASE_URL'],
      defaultModel: env['CTRL_OPENAI_MODEL'] ?? env['OPENAI_MODEL'],
    });
  }

  throw new Error(`Unknown CTRL_PROVIDER=${explicit}`);
}
