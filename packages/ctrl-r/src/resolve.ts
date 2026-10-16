import path from 'node:path';
import { providerPersistPath } from './persist';
import { ProviderRuntime, type ProviderRuntimeOptions } from './runtime';
import type { ModelProvider } from './types';

/**
 * Resolve the active chat provider from env (one-shot).
 * Prefer {@link ProviderRuntime} when the gateway needs live switching.
 *
 * - `CTRL_PROVIDER=mock` (default) → MockProvider
 * - `openai` / `zen` / `kilo` / `llama` / `device` / `litert` → see catalog
 * - Local llama-server is started by ctrl-a via `CTRL_LLAMA_BIN`, then pointed here
 */
export function resolveProvider(
  env: NodeJS.ProcessEnv = process.env
): ModelProvider {
  return new ProviderRuntime(env).getProvider();
}

export type CreateProviderRuntimeOptions = ProviderRuntimeOptions & {
  /** Directory for provider.json (defaults to CTRL_DATA_DIR or ./data). */
  dataDir?: string;
};

export function createProviderRuntime(
  env: NodeJS.ProcessEnv = process.env,
  options: CreateProviderRuntimeOptions = {}
): ProviderRuntime {
  const dataDir =
    options.dataDir ?? env['CTRL_DATA_DIR'] ?? path.join(process.cwd(), 'data');
  const persistPath =
    options.persistPath ?? providerPersistPath(path.resolve(dataDir));
  return new ProviderRuntime(env, { persistPath });
}
