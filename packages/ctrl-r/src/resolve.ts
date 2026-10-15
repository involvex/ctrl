import { ProviderRuntime } from './runtime';
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

export function createProviderRuntime(
  env: NodeJS.ProcessEnv = process.env
): ProviderRuntime {
  return new ProviderRuntime(env);
}
