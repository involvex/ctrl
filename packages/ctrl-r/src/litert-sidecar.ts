import {
  LocalOpenAiSidecar,
  type LocalOpenAiSidecarConfig,
  type LocalOpenAiSidecarStatus,
} from './local-openai-sidecar';

export type LitertLmSidecarStatus = LocalOpenAiSidecarStatus;

export type LitertLmSidecarConfig = Omit<LocalOpenAiSidecarConfig, 'name'> & {
  name?: string;
};

/** Default litert-lm OpenAI-compatible HTTP port. */
export const LITERT_LM_DEFAULT_PORT = 9379;

/**
 * Manages a local OpenAI-compatible litert-lm server (PC LiteRT path).
 * Mobile LiteRT stays on-device via react-native-litert-lm.
 */
export class LitertLmSidecar extends LocalOpenAiSidecar {
  constructor(config: LitertLmSidecarConfig) {
    super({
      ...config,
      name: config.name ?? 'litert-lm',
      port: config.port ?? LITERT_LM_DEFAULT_PORT,
      portArgs: config.portArgs ?? 'llama',
    });
  }
}

/** Create a litert-lm sidecar from env, or null when not configured. */
export function createLitertLmSidecarFromEnv(
  env: NodeJS.Dict<string> = process.env
): LitertLmSidecar | null {
  const bin = env['CTRL_LITERT_LM_BIN']?.trim();
  if (!bin) {
    return null;
  }
  const extra = env['CTRL_LITERT_LM_ARGS']?.trim();
  const args = extra ? extra.split(/\s+/).filter(Boolean) : [];
  const port = Number(env['CTRL_LITERT_LM_PORT'] ?? LITERT_LM_DEFAULT_PORT);
  return new LitertLmSidecar({
    bin,
    args,
    host: env['CTRL_LITERT_LM_HOST'] ?? '127.0.0.1',
    port:
      Number.isFinite(port) && port > 0 ? port : LITERT_LM_DEFAULT_PORT,
  });
}
