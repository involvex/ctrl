import {
  KILO_BASE_URL,
  KILO_DEFAULT_MODEL,
  ZEN_BASE_URL,
  ZEN_DEFAULT_MODEL,
  providerConfigSchema,
  type ProviderConfig,
  type ProviderDescriptor,
  type ProviderId,
  type ProviderStatusResponse,
  type UpdateProviderConfigInput,
} from '@involvex/ctrl-s';
import { listProviderCatalog } from './catalog';
import { DevicePairProvider } from './device-provider';
import { LiteRTProvider } from './litert-provider';
import { MockProvider } from './mock-provider';
import { OpenAICompatibleProvider } from './openai-compatible';
import {
  applyPersistedToConfig,
  loadPersistedProvider,
  savePersistedProvider,
} from './persist';
import type { ModelProvider } from './types';

export type ProviderRuntimeOptions = {
  /** Absolute path to provider.json (non-secret selection). */
  persistPath?: string;
};

type ProviderSecrets = {
  openai?: string;
  zen?: string;
  kilo?: string;
  deviceToken?: string;
};

function envSecrets(env: NodeJS.ProcessEnv): ProviderSecrets {
  return {
    openai: env['CTRL_OPENAI_API_KEY'] ?? env['OPENAI_API_KEY'],
    zen: env['CTRL_ZEN_API_KEY'] ?? env['OPENCODE_API_KEY'],
    kilo: env['CTRL_KILO_API_KEY'] ?? env['KILO_API_KEY'],
    deviceToken: env['CTRL_DEVICE_TOKEN'] ?? env['CTRL_GATEWAY_TOKEN'],
  };
}

function initialConfig(env: NodeJS.ProcessEnv): ProviderConfig {
  const explicit = (env['CTRL_PROVIDER'] ?? '').toLowerCase();
  let active: ProviderId = 'mock';
  if (
    explicit === 'openai' ||
    explicit === 'openai-compatible' ||
    explicit === 'zen' ||
    explicit === 'kilo' ||
    explicit === 'llama' ||
    explicit === 'litert' ||
    explicit === 'device' ||
    explicit === 'mock'
  ) {
    active =
      explicit === 'openai-compatible' ? 'openai' : (explicit as ProviderId);
  } else if (env['CTRL_OPENAI_API_KEY'] ?? env['OPENAI_API_KEY']) {
    active = 'openai';
  }

  return providerConfigSchema.parse({
    active,
    model: env['CTRL_OPENAI_MODEL'] ?? env['OPENAI_MODEL'],
    openai: {
      apiKeySet: Boolean(env['CTRL_OPENAI_API_KEY'] ?? env['OPENAI_API_KEY']),
      baseUrl: env['CTRL_OPENAI_BASE_URL'] ?? env['OPENAI_BASE_URL'],
      model: env['CTRL_OPENAI_MODEL'] ?? env['OPENAI_MODEL'],
    },
    zen: {
      apiKeySet: Boolean(env['CTRL_ZEN_API_KEY'] ?? env['OPENCODE_API_KEY']),
      model: env['CTRL_ZEN_MODEL'] ?? ZEN_DEFAULT_MODEL,
    },
    kilo: {
      apiKeySet: Boolean(env['CTRL_KILO_API_KEY'] ?? env['KILO_API_KEY']),
      model: env['CTRL_KILO_MODEL'] ?? KILO_DEFAULT_MODEL,
    },
    llama: {
      model: env['CTRL_LLAMA_MODEL'] ?? 'local',
      baseUrl: env['CTRL_OPENAI_BASE_URL'] ?? 'http://127.0.0.1:8080/v1',
    },
    litert: {
      modelId: env['CTRL_LITERT_MODEL'] ?? 'GEMMA_4_E2B_IT',
    },
    device: {
      gatewayUrl: env['CTRL_DEVICE_GATEWAY_URL'],
      tokenSet: Boolean(env['CTRL_DEVICE_TOKEN'] ?? env['CTRL_GATEWAY_TOKEN']),
    },
  });
}

function buildProvider(
  config: ProviderConfig,
  secrets: ProviderSecrets
): ModelProvider {
  const active = config.active;
  const modelOverride = config.model;

  switch (active) {
    case 'mock':
      return new MockProvider();
    case 'openai': {
      const key = secrets.openai;
      if (!key) {
        throw new Error('OpenAI API key required (CTRL_OPENAI_API_KEY)');
      }
      return new OpenAICompatibleProvider({
        id: 'openai',
        apiKey: key,
        baseUrl: config.openai.baseUrl,
        defaultModel: modelOverride ?? config.openai.model ?? 'gpt-4o-mini',
      });
    }
    case 'zen': {
      const key = secrets.zen ?? secrets.openai;
      if (!key) {
        throw new Error(
          'OpenCode Zen API key required (CTRL_ZEN_API_KEY / OPENCODE_API_KEY)'
        );
      }
      return new OpenAICompatibleProvider({
        id: 'zen',
        apiKey: key,
        baseUrl: ZEN_BASE_URL,
        defaultModel: modelOverride ?? config.zen.model ?? ZEN_DEFAULT_MODEL,
      });
    }
    case 'kilo': {
      const key = secrets.kilo ?? secrets.openai;
      if (!key) {
        throw new Error(
          'Kilo API key required (CTRL_KILO_API_KEY / KILO_API_KEY)'
        );
      }
      return new OpenAICompatibleProvider({
        id: 'kilo',
        apiKey: key,
        baseUrl: KILO_BASE_URL,
        defaultModel: modelOverride ?? config.kilo.model ?? KILO_DEFAULT_MODEL,
      });
    }
    case 'llama': {
      return new OpenAICompatibleProvider({
        id: 'llama',
        apiKey: secrets.openai ?? 'local',
        baseUrl: config.llama.baseUrl ?? 'http://127.0.0.1:8080/v1',
        defaultModel: modelOverride ?? config.llama.model ?? 'local',
      });
    }
    case 'litert':
      return new LiteRTProvider(config.litert.modelId);
    case 'device': {
      const url = config.device.gatewayUrl;
      if (!url) {
        throw new Error('Paired gateway URL required (device.gatewayUrl)');
      }
      return new DevicePairProvider({
        gatewayUrl: url,
        token: secrets.deviceToken,
      });
    }
    default: {
      const unexpected: never = active;
      throw new Error(`Unknown provider ${String(unexpected)}`);
    }
  }
}

/**
 * Mutable provider selection for the gateway process.
 * Secrets stay in memory; public status never echoes raw keys.
 * Non-secret selection persists to `provider.json` when persistPath is set.
 */
export class ProviderRuntime {
  private config: ProviderConfig;
  private secrets: ProviderSecrets;
  private provider: ModelProvider;
  private deviceGatewayUrl?: string;
  private readonly persistPath?: string;

  constructor(
    env: NodeJS.ProcessEnv = process.env,
    options: ProviderRuntimeOptions = {}
  ) {
    this.secrets = envSecrets(env);
    this.config = initialConfig(env);
    this.deviceGatewayUrl = env['CTRL_DEVICE_GATEWAY_URL'];
    this.persistPath = options.persistPath;
    if (this.persistPath) {
      const persisted = loadPersistedProvider(this.persistPath);
      if (persisted) {
        const applied = applyPersistedToConfig(this.config, persisted);
        this.config = applied.config;
        if (applied.deviceGatewayUrl) {
          this.deviceGatewayUrl = applied.deviceGatewayUrl;
        }
      }
    }
    this.provider = this.safeBuild();
  }

  getProvider(): ModelProvider {
    return this.provider;
  }

  getConfig(): ProviderConfig {
    return this.config;
  }

  status(): ProviderStatusResponse {
    const providers = listProviderCatalog().map((entry) => {
      const configured = this.isConfigured(entry.id);
      const available = this.isAvailable(entry.id);
      const descriptor: ProviderDescriptor = {
        ...entry,
        configured,
        available,
        ...(available
          ? {}
          : { unavailableReason: this.unavailableReason(entry.id) }),
      };
      return descriptor;
    });

    return {
      active: this.config.active,
      model: this.config.model,
      config: this.publicConfig(),
      providers,
    };
  }

  update(input: UpdateProviderConfigInput): ProviderStatusResponse {
    if (input.openai) {
      if (input.openai.clearApiKey) {
        delete this.secrets.openai;
      }
      if (input.openai.apiKey !== undefined && input.openai.apiKey !== '') {
        this.secrets.openai = input.openai.apiKey;
      }
      this.config = {
        ...this.config,
        openai: {
          apiKeySet: Boolean(this.secrets.openai),
          baseUrl: input.openai.baseUrl ?? this.config.openai.baseUrl,
          model: input.openai.model ?? this.config.openai.model,
        },
      };
    }
    if (input.zen) {
      if (input.zen.clearApiKey) {
        delete this.secrets.zen;
      }
      if (input.zen.apiKey !== undefined && input.zen.apiKey !== '') {
        this.secrets.zen = input.zen.apiKey;
      }
      this.config = {
        ...this.config,
        zen: {
          apiKeySet: Boolean(this.secrets.zen),
          model: input.zen.model ?? this.config.zen.model,
        },
      };
    }
    if (input.kilo) {
      if (input.kilo.clearApiKey) {
        delete this.secrets.kilo;
      }
      if (input.kilo.apiKey !== undefined && input.kilo.apiKey !== '') {
        this.secrets.kilo = input.kilo.apiKey;
      }
      this.config = {
        ...this.config,
        kilo: {
          apiKeySet: Boolean(this.secrets.kilo),
          model: input.kilo.model ?? this.config.kilo.model,
        },
      };
    }
    if (input.llama) {
      this.config = {
        ...this.config,
        llama: {
          model: input.llama.model ?? this.config.llama.model,
          baseUrl: input.llama.baseUrl ?? this.config.llama.baseUrl,
        },
      };
    }
    if (input.litert) {
      this.config = {
        ...this.config,
        litert: {
          modelId: input.litert.modelId ?? this.config.litert.modelId,
        },
      };
    }
    if (input.device) {
      if (input.device.clearToken) {
        delete this.secrets.deviceToken;
      }
      if (input.device.token !== undefined && input.device.token !== '') {
        this.secrets.deviceToken = input.device.token;
      }
      if (input.device.gatewayUrl) {
        this.deviceGatewayUrl = input.device.gatewayUrl;
      }
      this.config = {
        ...this.config,
        device: {
          gatewayUrl: this.deviceGatewayUrl,
          tokenSet: Boolean(this.secrets.deviceToken),
        },
      };
    }
    if (input.model !== undefined) {
      this.config = { ...this.config, model: input.model };
    }
    if (input.active !== undefined) {
      this.config = { ...this.config, active: input.active };
    }

    this.provider = this.safeBuild();
    this.persist();
    return this.status();
  }

  private persist(): void {
    if (!this.persistPath) {
      return;
    }
    try {
      savePersistedProvider(
        this.persistPath,
        this.publicConfig(),
        this.deviceGatewayUrl
      );
    } catch (err) {
      process.stderr.write(
        `[ctrl-r] provider persist failed: ${
          err instanceof Error ? err.message : String(err)
        }\n`
      );
    }
  }

  private publicConfig(): ProviderConfig {
    return providerConfigSchema.parse({
      ...this.config,
      openai: {
        ...this.config.openai,
        apiKeySet: Boolean(this.secrets.openai),
      },
      zen: {
        ...this.config.zen,
        apiKeySet: Boolean(this.secrets.zen),
      },
      kilo: {
        ...this.config.kilo,
        apiKeySet: Boolean(this.secrets.kilo),
      },
      device: {
        gatewayUrl: this.deviceGatewayUrl ?? this.config.device.gatewayUrl,
        tokenSet: Boolean(this.secrets.deviceToken),
      },
    });
  }

  private isConfigured(id: ProviderId): boolean {
    switch (id) {
      case 'mock':
      case 'litert':
        return true;
      case 'openai':
        return Boolean(this.secrets.openai);
      case 'zen':
        return Boolean(this.secrets.zen ?? this.secrets.openai);
      case 'kilo':
        return Boolean(this.secrets.kilo ?? this.secrets.openai);
      case 'llama':
        return true;
      case 'device':
        return Boolean(this.deviceGatewayUrl ?? this.config.device.gatewayUrl);
      default:
        return false;
    }
  }

  private isAvailable(id: ProviderId): boolean {
    if (id === 'litert') {
      return false; // gateway process — use mobile
    }
    return this.isConfigured(id) || id === 'mock' || id === 'llama';
  }

  private unavailableReason(id: ProviderId): string | undefined {
    if (id === 'litert') {
      return 'LiteRT runs on mobile only';
    }
    if (!this.isConfigured(id)) {
      return 'not configured';
    }
    return undefined;
  }

  private safeBuild(): ModelProvider {
    try {
      return buildProvider(this.publicConfig(), this.secrets);
    } catch (err) {
      process.stderr.write(
        `[ctrl-r] provider build failed (${this.config.active}): ${
          err instanceof Error ? err.message : String(err)
        } — falling back to mock\n`
      );
      this.config = { ...this.config, active: 'mock' };
      return new MockProvider();
    }
  }
}
