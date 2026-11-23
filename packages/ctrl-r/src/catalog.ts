import {
  KILO_BASE_URL,
  KILO_DEFAULT_MODEL,
  ZEN_BASE_URL,
  ZEN_DEFAULT_MODEL,
  type ProviderDescriptor,
  type ProviderId,
} from '@involvex/ctrl-s';

export type HfModelEntry = {
  id: string;
  name: string;
  description: string;
  sizeGb?: number;
  tags: string[];
  /** Pinned Hugging Face resolve URL for one GGUF file. */
  downloadUrl: string;
  /** Local filename under userData/models/. */
  filename: string;
  quantizations?: string[];
};

const HF_MODEL_CATALOG: HfModelEntry[] = [
  {
    id: 'bartowski/Phi-3.1-mini-4k-instruct-GGUF',
    name: 'Phi-3.1 Mini (GGUF)',
    description: 'Small efficient model, good for general chat',
    sizeGb: 2.4,
    tags: ['chat', 'small', 'gguf'],
    quantizations: ['Q4_K_M'],
    filename: 'Phi-3.1-mini-4k-instruct-Q4_K_M.gguf',
    downloadUrl:
      'https://huggingface.co/bartowski/Phi-3.1-mini-4k-instruct-GGUF/resolve/main/Phi-3.1-mini-4k-instruct-Q4_K_M.gguf',
  },
  {
    id: 'bartowski/Llama-3.2-3B-Instruct-GGUF',
    name: 'Llama 3.2 3B Instruct (GGUF)',
    description: 'Meta Llama 3.2, instruction tuned',
    sizeGb: 2.0,
    tags: ['chat', 'llama', 'gguf'],
    quantizations: ['Q4_K_M'],
    filename: 'Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    downloadUrl:
      'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf',
  },
  {
    id: 'lmstudio-community/SmolLM2-1.7B-Instruct-GGUF',
    name: 'SmolLM2 1.7B Instruct (GGUF)',
    description: 'Very compact, great for local use',
    sizeGb: 1.1,
    tags: ['chat', 'small', 'gguf'],
    quantizations: ['Q4_K_M'],
    filename: 'SmolLM2-1.7B-Instruct-Q4_K_M.gguf',
    downloadUrl:
      'https://huggingface.co/lmstudio-community/SmolLM2-1.7B-Instruct-GGUF/resolve/main/SmolLM2-1.7B-Instruct-Q4_K_M.gguf',
  },
  {
    id: 'QuantFactory/Meta-Llama-3-8B-Instruct-GGUF',
    name: 'Llama 3 8B Instruct (GGUF)',
    description: 'Larger model with better quality',
    sizeGb: 4.9,
    tags: ['chat', 'llama', 'gguf'],
    quantizations: ['Q4_K_M'],
    filename: 'Meta-Llama-3-8B-Instruct.Q4_K_M.gguf',
    downloadUrl:
      'https://huggingface.co/QuantFactory/Meta-Llama-3-8B-Instruct-GGUF/resolve/main/Meta-Llama-3-8B-Instruct.Q4_K_M.gguf',
  },
  {
    id: 'bartowski/gemma-2-2b-it-GGUF',
    name: 'Gemma 2 2B IT (GGUF)',
    description: 'Google Gemma, efficient and capable',
    sizeGb: 1.7,
    tags: ['chat', 'gemma', 'gguf'],
    quantizations: ['Q4_K_M'],
    filename: 'gemma-2-2b-it-Q4_K_M.gguf',
    downloadUrl:
      'https://huggingface.co/bartowski/gemma-2-2b-it-GGUF/resolve/main/gemma-2-2b-it-Q4_K_M.gguf',
  },
];

const CATALOG: Record<
  ProviderId,
  Omit<ProviderDescriptor, 'configured' | 'available' | 'unavailableReason'>
> = {
  mock: {
    id: 'mock',
    label: 'Mock',
    kind: 'local-mock',
    description: 'Deterministic local echo for offline / contract tests.',
    surfaces: ['gateway', 'desktop'],
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
    label: 'LiteRT / litert-lm',
    kind: 'on-device-litert',
    description:
      'Phone: on-device JNI. PC: OpenAI-compatible litert-lm (default :9379/v1).',
    surfaces: ['mobile', 'gateway', 'desktop'],
    requiresApiKey: false,
    defaultBaseUrl: 'http://127.0.0.1:9379/v1',
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

export function listHfModelCatalog(): HfModelEntry[] {
  return HF_MODEL_CATALOG;
}

export function getHfModelCatalogEntry(id: string): HfModelEntry | undefined {
  return HF_MODEL_CATALOG.find((m) => m.id === id);
}
