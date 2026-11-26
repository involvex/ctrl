import {
  KILO_BASE_URL,
  KILO_DEFAULT_MODEL,
  ZEN_BASE_URL,
  ZEN_DEFAULT_MODEL,
  type ProviderDescriptor,
  type ProviderId,
} from '@involvex/ctrl-s';

/** One downloadable GGUF quant for an HF catalog model. */
export type HfModelQuantOption = {
  id: string;
  filename: string;
  downloadUrl: string;
  sizeGb?: number;
};

export type HfModelEntry = {
  id: string;
  name: string;
  description: string;
  sizeGb?: number;
  tags: string[];
  /** Default quant id (usually Q4_K_M). */
  defaultQuant: string;
  /** Pinned Hugging Face resolve URL for the default quant. */
  downloadUrl: string;
  /** Local filename under userData/models/ for the default quant. */
  filename: string;
  /** Short list of pinned quants the desktop picker can choose from. */
  quantizations: HfModelQuantOption[];
};

function hfQuant(
  repoId: string,
  filename: string,
  quantId: string,
  sizeGb?: number
): HfModelQuantOption {
  return {
    id: quantId,
    filename,
    downloadUrl: `https://huggingface.co/${repoId}/resolve/main/${filename}`,
    ...(sizeGb !== undefined ? { sizeGb } : {}),
  };
}

function entryFromQuants(
  meta: {
    id: string;
    name: string;
    description: string;
    tags: string[];
  },
  quantizations: HfModelQuantOption[],
  defaultQuant = 'Q4_K_M'
): HfModelEntry {
  const selected =
    quantizations.find((q) => q.id === defaultQuant) ?? quantizations[0];
  if (!selected) {
    throw new Error(`HF catalog entry ${meta.id} has no quantizations`);
  }
  return {
    ...meta,
    defaultQuant: selected.id,
    downloadUrl: selected.downloadUrl,
    filename: selected.filename,
    sizeGb: selected.sizeGb,
    quantizations,
  };
}

const HF_MODEL_CATALOG: HfModelEntry[] = [
  entryFromQuants(
    {
      id: 'bartowski/Phi-3.1-mini-4k-instruct-GGUF',
      name: 'Phi-3.1 Mini (GGUF)',
      description: 'Small efficient model, good for general chat',
      tags: ['chat', 'small', 'gguf'],
    },
    [
      hfQuant(
        'bartowski/Phi-3.1-mini-4k-instruct-GGUF',
        'Phi-3.1-mini-4k-instruct-Q4_K_M.gguf',
        'Q4_K_M',
        2.4
      ),
      hfQuant(
        'bartowski/Phi-3.1-mini-4k-instruct-GGUF',
        'Phi-3.1-mini-4k-instruct-Q5_K_M.gguf',
        'Q5_K_M',
        2.8
      ),
      hfQuant(
        'bartowski/Phi-3.1-mini-4k-instruct-GGUF',
        'Phi-3.1-mini-4k-instruct-Q8_0.gguf',
        'Q8_0',
        4.1
      ),
    ]
  ),
  entryFromQuants(
    {
      id: 'bartowski/Llama-3.2-3B-Instruct-GGUF',
      name: 'Llama 3.2 3B Instruct (GGUF)',
      description: 'Meta Llama 3.2, instruction tuned',
      tags: ['chat', 'llama', 'gguf'],
    },
    [
      hfQuant(
        'bartowski/Llama-3.2-3B-Instruct-GGUF',
        'Llama-3.2-3B-Instruct-Q4_K_M.gguf',
        'Q4_K_M',
        2.0
      ),
      hfQuant(
        'bartowski/Llama-3.2-3B-Instruct-GGUF',
        'Llama-3.2-3B-Instruct-Q5_K_M.gguf',
        'Q5_K_M',
        2.3
      ),
      hfQuant(
        'bartowski/Llama-3.2-3B-Instruct-GGUF',
        'Llama-3.2-3B-Instruct-Q8_0.gguf',
        'Q8_0',
        3.4
      ),
    ]
  ),
  entryFromQuants(
    {
      id: 'lmstudio-community/SmolLM2-1.7B-Instruct-GGUF',
      name: 'SmolLM2 1.7B Instruct (GGUF)',
      description: 'Very compact, great for local use',
      tags: ['chat', 'small', 'gguf'],
    },
    [
      hfQuant(
        'lmstudio-community/SmolLM2-1.7B-Instruct-GGUF',
        'SmolLM2-1.7B-Instruct-Q4_K_M.gguf',
        'Q4_K_M',
        1.1
      ),
      hfQuant(
        'lmstudio-community/SmolLM2-1.7B-Instruct-GGUF',
        'SmolLM2-1.7B-Instruct-Q6_K.gguf',
        'Q6_K',
        1.4
      ),
      hfQuant(
        'lmstudio-community/SmolLM2-1.7B-Instruct-GGUF',
        'SmolLM2-1.7B-Instruct-Q8_0.gguf',
        'Q8_0',
        1.8
      ),
    ]
  ),
  entryFromQuants(
    {
      id: 'QuantFactory/Meta-Llama-3-8B-Instruct-GGUF',
      name: 'Llama 3 8B Instruct (GGUF)',
      description: 'Larger model with better quality',
      tags: ['chat', 'llama', 'gguf'],
    },
    [
      hfQuant(
        'QuantFactory/Meta-Llama-3-8B-Instruct-GGUF',
        'Meta-Llama-3-8B-Instruct.Q4_K_M.gguf',
        'Q4_K_M',
        4.9
      ),
      hfQuant(
        'QuantFactory/Meta-Llama-3-8B-Instruct-GGUF',
        'Meta-Llama-3-8B-Instruct.Q5_K_M.gguf',
        'Q5_K_M',
        5.7
      ),
      hfQuant(
        'QuantFactory/Meta-Llama-3-8B-Instruct-GGUF',
        'Meta-Llama-3-8B-Instruct.Q8_0.gguf',
        'Q8_0',
        8.5
      ),
    ]
  ),
  entryFromQuants(
    {
      id: 'bartowski/gemma-2-2b-it-GGUF',
      name: 'Gemma 2 2B IT (GGUF)',
      description: 'Google Gemma, efficient and capable',
      tags: ['chat', 'gemma', 'gguf'],
    },
    [
      hfQuant(
        'bartowski/gemma-2-2b-it-GGUF',
        'gemma-2-2b-it-Q4_K_M.gguf',
        'Q4_K_M',
        1.7
      ),
      hfQuant(
        'bartowski/gemma-2-2b-it-GGUF',
        'gemma-2-2b-it-Q5_K_M.gguf',
        'Q5_K_M',
        1.9
      ),
      hfQuant(
        'bartowski/gemma-2-2b-it-GGUF',
        'gemma-2-2b-it-Q8_0.gguf',
        'Q8_0',
        2.8
      ),
    ]
  ),
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

/** Resolve a catalog entry to a concrete quant (defaults to entry.defaultQuant). */
export function resolveHfModelQuant(
  entry: HfModelEntry,
  quantId?: string
): HfModelQuantOption {
  const wanted = quantId?.trim() || entry.defaultQuant;
  const match =
    entry.quantizations.find((q) => q.id === wanted) ??
    entry.quantizations.find((q) => q.id === entry.defaultQuant) ??
    entry.quantizations[0];
  if (match) {
    return match;
  }
  return {
    id: entry.defaultQuant,
    filename: entry.filename,
    downloadUrl: entry.downloadUrl,
    sizeGb: entry.sizeGb,
  };
}
