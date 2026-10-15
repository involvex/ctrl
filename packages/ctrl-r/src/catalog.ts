import {
  KILO_BASE_URL,
  KILO_DEFAULT_MODEL,
  ZEN_BASE_URL,
  ZEN_DEFAULT_MODEL,
  type ProviderDescriptor,
  type ProviderId,
} from '@involvex/ctrl-s';

const CATALOG: Record<
  ProviderId,
  Omit<ProviderDescriptor, 'configured' | 'available' | 'unavailableReason'>
> = {
  mock: {
    id: 'mock',
    label: 'Mock',
    kind: 'local-mock',
    description: 'Deterministic local echo for offline / contract tests.',
    surfaces: ['gateway', 'desktop', 'mobile'],
    requiresApiKey: false,
    defaultModel: 'mock',
  },
  openai: {
    id: 'openai',
    label: 'OpenAI-compatible',
    kind: 'openai-compatible',
    description:
      'Any OpenAI Chat Completions endpoint (OpenAI, OpenRouter, …).',
    surfaces: ['gateway', 'desktop'],
    requiresApiKey: true,
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
  },
  zen: {
    id: 'zen',
    label: 'OpenCode Zen',
    kind: 'openai-compatible',
    description: 'OpenCode Zen verified models via Chat Completions.',
    surfaces: ['gateway', 'desktop'],
    requiresApiKey: true,
    defaultBaseUrl: ZEN_BASE_URL,
    defaultModel: ZEN_DEFAULT_MODEL,
  },
  kilo: {
    id: 'kilo',
    label: 'Kilo Gateway',
    kind: 'openai-compatible',
    description: 'Kilo AI Gateway (hundreds of models, one key).',
    surfaces: ['gateway', 'desktop'],
    requiresApiKey: true,
    defaultBaseUrl: KILO_BASE_URL,
    defaultModel: KILO_DEFAULT_MODEL,
  },
  llama: {
    id: 'llama',
    label: 'Local llama.cpp',
    kind: 'local-llama',
    description: 'Local llama-server sidecar (OpenAI-compatible).',
    surfaces: ['gateway', 'desktop'],
    requiresApiKey: false,
    defaultBaseUrl: 'http://127.0.0.1:8080/v1',
    defaultModel: 'local',
  },
  litert: {
    id: 'litert',
    label: 'On-device LiteRT',
    kind: 'on-device-litert',
    description: 'Run Gemma / LiteRT models on the phone (mobile).',
    surfaces: ['mobile'],
    requiresApiKey: false,
    defaultModel: 'GEMMA_4_E2B_IT',
  },
  device: {
    id: 'device',
    label: 'Paired device / PC',
    kind: 'paired-gateway',
    description: 'Route chat through another ctrl gateway (phone → PC).',
    surfaces: ['mobile', 'desktop', 'gateway'],
    requiresApiKey: false,
  },
};

export function listProviderCatalog(): Array<
  Omit<ProviderDescriptor, 'configured' | 'available' | 'unavailableReason'>
> {
  return Object.values(CATALOG);
}

export function getProviderCatalogEntry(
  id: ProviderId
): Omit<ProviderDescriptor, 'configured' | 'available' | 'unavailableReason'> {
  return CATALOG[id];
}
