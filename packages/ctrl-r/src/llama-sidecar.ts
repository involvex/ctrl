import {
  LocalOpenAiSidecar,
  type LocalOpenAiSidecarConfig,
  type LocalOpenAiSidecarStatus,
} from './local-openai-sidecar';

export type LlamaSidecarStatus = LocalOpenAiSidecarStatus;

export type LlamaSidecarConfig = Omit<LocalOpenAiSidecarConfig, 'name'> & {
  name?: string;
};

/**
 * Manages a local OpenAI-compatible llama-server process (Phase 3).
 * Plan places sidecar ownership in ctrl-r RuntimeManager, not Electron.
 */
export class LlamaSidecar extends LocalOpenAiSidecar {
  constructor(config: LlamaSidecarConfig) {
    super({
      ...config,
      name: config.name ?? 'llama-server',
      port: config.port ?? 8080,
      portArgs: config.portArgs ?? 'llama',
    });
  }
}

/** Create a sidecar from env, or null when not configured. */
export function createLlamaSidecarFromEnv(
  env: NodeJS.Dict<string> = process.env
): LlamaSidecar | null {
  const bin = env['CTRL_LLAMA_BIN']?.trim();
  if (!bin) {
    return null;
  }
  const extra = env['CTRL_LLAMA_ARGS']?.trim();
  const args = extra ? extra.split(/\s+/).filter(Boolean) : [];
  const port = Number(env['CTRL_LLAMA_PORT'] ?? 8080);
  return new LlamaSidecar({
    bin,
    args,
    host: env['CTRL_LLAMA_HOST'] ?? '127.0.0.1',
    port: Number.isFinite(port) && port > 0 ? port : 8080,
  });
}
