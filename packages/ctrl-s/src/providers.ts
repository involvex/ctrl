import { z } from 'zod';

/** Runtime provider ids selectable in apps / gateway. */
export const providerIdSchema = z.enum([
  'mock',
  'openai',
  'zen',
  'kilo',
  'llama',
  'litert',
  'device',
]);

export type ProviderId = z.infer<typeof providerIdSchema>;

export const providerKindSchema = z.enum([
  'local-mock',
  'openai-compatible',
  'local-llama',
  'on-device-litert',
  'paired-gateway',
]);

export type ProviderKind = z.infer<typeof providerKindSchema>;

export const providerDescriptorSchema = z.object({
  id: providerIdSchema,
  label: z.string(),
  kind: providerKindSchema,
  description: z.string(),
  /** Where this provider can run. */
  surfaces: z.array(z.enum(['gateway', 'mobile', 'desktop'])),
  requiresApiKey: z.boolean(),
  defaultBaseUrl: z.string().url().optional(),
  defaultModel: z.string().optional(),
  configured: z.boolean().default(false),
  available: z.boolean().default(true),
  unavailableReason: z.string().optional(),
});

export type ProviderDescriptor = z.infer<typeof providerDescriptorSchema>;

export const providerConfigSchema = z.object({
  active: providerIdSchema.default('mock'),
  model: z.string().optional(),
  /** Per-provider secrets/URLs (never echo raw secrets back to clients). */
  openai: z
    .object({
      apiKeySet: z.boolean().default(false),
      baseUrl: z.string().url().optional(),
      model: z.string().optional(),
    })
    .default({ apiKeySet: false }),
  zen: z
    .object({
      apiKeySet: z.boolean().default(false),
      model: z.string().optional(),
    })
    .default({ apiKeySet: false }),
  kilo: z
    .object({
      apiKeySet: z.boolean().default(false),
      model: z.string().optional(),
    })
    .default({ apiKeySet: false }),
  llama: z
    .object({
      model: z.string().optional(),
      baseUrl: z.string().url().optional(),
    })
    .default({}),
  litert: z
    .object({
      modelId: z.string().optional(),
    })
    .default({}),
  device: z
    .object({
      gatewayUrl: z.string().url().optional(),
      tokenSet: z.boolean().default(false),
    })
    .default({ tokenSet: false }),
});

export type ProviderConfig = z.infer<typeof providerConfigSchema>;

export const updateProviderConfigInputSchema = z.object({
  active: providerIdSchema.optional(),
  model: z.string().min(1).optional(),
  openai: z
    .object({
      apiKey: z.string().optional(),
      baseUrl: z.string().url().optional(),
      model: z.string().optional(),
      clearApiKey: z.boolean().optional(),
    })
    .optional(),
  zen: z
    .object({
      apiKey: z.string().optional(),
      model: z.string().optional(),
      clearApiKey: z.boolean().optional(),
    })
    .optional(),
  kilo: z
    .object({
      apiKey: z.string().optional(),
      model: z.string().optional(),
      clearApiKey: z.boolean().optional(),
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
      token: z.string().optional(),
      clearToken: z.boolean().optional(),
    })
    .optional(),
});

export type UpdateProviderConfigInput = z.infer<
  typeof updateProviderConfigInputSchema
>;

export const providerStatusResponseSchema = z.object({
  active: providerIdSchema,
  model: z.string().optional(),
  config: providerConfigSchema,
  providers: z.array(providerDescriptorSchema),
});

export type ProviderStatusResponse = z.infer<
  typeof providerStatusResponseSchema
>;

export const ZEN_BASE_URL = 'https://opencode.ai/zen/v1';
export const KILO_BASE_URL = 'https://ai-gateway.kilo.ai/api/v1';
export const ZEN_DEFAULT_MODEL = 'deepseek-v4-pro';
export const KILO_DEFAULT_MODEL = 'anthropic/claude-sonnet-4.6';
