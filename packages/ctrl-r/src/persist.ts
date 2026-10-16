import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import {
  providerIdSchema,
  type ProviderConfig,
  type ProviderId,
} from '@involvex/ctrl-s';

/** Disk shape for non-secret provider selection (keys stay in env/memory). */
export const persistedProviderSchema = z.object({
  version: z.literal(1),
  active: providerIdSchema.optional(),
  model: z.string().optional(),
  openai: z
    .object({
      baseUrl: z.string().url().optional(),
      model: z.string().optional(),
    })
    .optional(),
  zen: z
    .object({
      model: z.string().optional(),
    })
    .optional(),
  kilo: z
    .object({
      model: z.string().optional(),
    })
    .optional(),
  llama: z
    .object({
      model: z.string().optional(),
      baseUrl: z.string().url().optional(),
    })
    .optional(),
  litert: z
    .object({
      modelId: z.string().optional(),
    })
    .optional(),
  device: z
    .object({
      gatewayUrl: z.string().url().optional(),
    })
    .optional(),
});

export type PersistedProvider = z.infer<typeof persistedProviderSchema>;

export function providerPersistPath(dataDir: string): string {
  return path.join(dataDir, 'provider.json');
}

export function loadPersistedProvider(
  filePath: string
): PersistedProvider | null {
  try {
    const raw = readFileSync(filePath, 'utf8');
    return persistedProviderSchema.parse(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function savePersistedProvider(
  filePath: string,
  config: ProviderConfig,
  deviceGatewayUrl?: string
): void {
  const deviceUrl = deviceGatewayUrl ?? config.device.gatewayUrl;
  const payload: PersistedProvider = {
    version: 1,
    active: config.active,
    ...(config.model ? { model: config.model } : {}),
    openai: {
      ...(config.openai.baseUrl ? { baseUrl: config.openai.baseUrl } : {}),
      ...(config.openai.model ? { model: config.openai.model } : {}),
    },
    zen: config.zen.model ? { model: config.zen.model } : {},
    kilo: config.kilo.model ? { model: config.kilo.model } : {},
    llama: {
      ...(config.llama.model ? { model: config.llama.model } : {}),
      ...(config.llama.baseUrl ? { baseUrl: config.llama.baseUrl } : {}),
    },
    litert: config.litert.modelId ? { modelId: config.litert.modelId } : {},
    device: deviceUrl ? { gatewayUrl: deviceUrl } : {},
  };
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

export function applyPersistedToConfig(
  base: ProviderConfig,
  persisted: PersistedProvider
): { config: ProviderConfig; deviceGatewayUrl?: string; active?: ProviderId } {
  const config: ProviderConfig = {
    ...base,
    ...(persisted.active ? { active: persisted.active } : {}),
    ...(persisted.model !== undefined ? { model: persisted.model } : {}),
    openai: {
      ...base.openai,
      ...(persisted.openai?.baseUrl
        ? { baseUrl: persisted.openai.baseUrl }
        : {}),
      ...(persisted.openai?.model ? { model: persisted.openai.model } : {}),
    },
    zen: {
      ...base.zen,
      ...(persisted.zen?.model ? { model: persisted.zen.model } : {}),
    },
    kilo: {
      ...base.kilo,
      ...(persisted.kilo?.model ? { model: persisted.kilo.model } : {}),
    },
    llama: {
      ...base.llama,
      ...(persisted.llama?.model ? { model: persisted.llama.model } : {}),
      ...(persisted.llama?.baseUrl ? { baseUrl: persisted.llama.baseUrl } : {}),
    },
    litert: {
      ...base.litert,
      ...(persisted.litert?.modelId
        ? { modelId: persisted.litert.modelId }
        : {}),
    },
    device: {
      ...base.device,
      ...(persisted.device?.gatewayUrl
        ? { gatewayUrl: persisted.device.gatewayUrl }
        : {}),
    },
  };
  return {
    config,
    deviceGatewayUrl: persisted.device?.gatewayUrl,
    active: persisted.active,
  };
}
