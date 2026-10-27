import AsyncStorage from '@react-native-async-storage/async-storage';

export const AGENT_CONFIG_KEY = 'ctrl.mobile.agents.v1';

export type AgentMode = 'ask' | 'plan' | 'auto';

export type AgentPersona = {
  id: string;
  name: string;
  instructions: string;
  /** Linked gateway agent_profiles row when synced. */
  gatewayProfileId?: string;
  updatedAt?: number;
};

export type AgentConfig = {
  mode: AgentMode;
  rules: string;
  activePersonaId: string;
  personas: AgentPersona[];
};

export const PERSONA_PRESETS: AgentPersona[] = [
  {
    id: 'concise',
    name: 'Concise assistant',
    instructions:
      'You are ctrl. Be concise, practical, and stay in character across generators.',
  },
  {
    id: 'marketing',
    name: 'Marketing expert',
    instructions:
      'You are a marketing expert. Focus on positioning, messaging, channels, and measurable experiments. Be concrete.',
  },
  {
    id: 'pm',
    name: 'Project manager',
    instructions:
      'You are a project manager. Break work into milestones, risks, owners, and next actions. Prefer clarity over jargon.',
  },
  {
    id: 'coding',
    name: 'Coding pair',
    instructions:
      'You are a coding pair. Prefer small diffs, cite files, and verify assumptions. Avoid over-engineering.',
  },
];

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  mode: 'ask',
  rules: '',
  activePersonaId: 'concise',
  personas: PERSONA_PRESETS,
};

const MODE_ADDENDA: Record<AgentMode, string> = {
  ask: 'Mode: ASK. Answer only. Do not suggest tools or act. Keep replies short.',
  plan: 'Mode: PLAN. Outline steps first and wait before acting. No destructive assumptions.',
  auto: 'Mode: AUTO. Act toward the goal. Use tools/host when available. Report concise progress.',
};

function isConfig(value: unknown): value is AgentConfig {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const v = value as AgentConfig;
  return (
    (v.mode === 'ask' || v.mode === 'plan' || v.mode === 'auto') &&
    typeof v.rules === 'string' &&
    typeof v.activePersonaId === 'string' &&
    Array.isArray(v.personas)
  );
}

export async function loadAgentConfig(): Promise<AgentConfig> {
  try {
    const raw = await AsyncStorage.getItem(AGENT_CONFIG_KEY);
    if (!raw) {
      return structuredClone(DEFAULT_AGENT_CONFIG);
    }
    const parsed: unknown = JSON.parse(raw);
    if (isConfig(parsed)) {
      const presetsById = new Map(PERSONA_PRESETS.map((p) => [p.id, p]));
      const merged = [...parsed.personas];
      for (const preset of PERSONA_PRESETS) {
        if (!merged.some((p) => p.id === preset.id)) {
          merged.push(preset);
        } else {
          const idx = merged.findIndex((p) => p.id === preset.id);
          if (idx >= 0 && presetsById.has(preset.id)) {
            // keep user edits if any; presets only fill gaps
          }
        }
      }
      return { ...parsed, personas: merged };
    }
  } catch {
    // fall through
  }
  return structuredClone(DEFAULT_AGENT_CONFIG);
}

export async function saveAgentConfig(config: AgentConfig): Promise<void> {
  await AsyncStorage.setItem(AGENT_CONFIG_KEY, JSON.stringify(config));
}

export function activePersona(config: AgentConfig): AgentPersona {
  return (
    config.personas.find((p) => p.id === config.activePersonaId) ??
    PERSONA_PRESETS[0]!
  );
}

/** Full system prompt for LiteRT / gateway prefix. */
export function buildSystemPrompt(config: AgentConfig): string {
  const persona = activePersona(config);
  const parts = [persona.instructions.trim(), MODE_ADDENDA[config.mode]];
  const rules = config.rules.trim();
  if (rules) {
    parts.push(`Custom rules:\n${rules}`);
  }
  return parts.join('\n\n');
}

export function modeLabel(mode: AgentMode): string {
  if (mode === 'plan') {
    return 'Plan';
  }
  if (mode === 'auto') {
    return 'Auto';
  }
  return 'Ask';
}

export function isPresetPersonaId(id: string): boolean {
  return PERSONA_PRESETS.some((p) => p.id === id);
}

function newPersonaId(): string {
  return `persona_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createPersona(
  config: AgentConfig,
  input: { name: string; instructions: string }
): AgentConfig {
  const name = input.name.trim() || 'Custom persona';
  const instructions =
    input.instructions.trim() ||
    'You are a helpful assistant. Be clear and practical.';
  const persona: AgentPersona = {
    id: newPersonaId(),
    name,
    instructions,
    updatedAt: Date.now(),
  };
  return {
    ...config,
    activePersonaId: persona.id,
    personas: [persona, ...config.personas],
  };
}

export function updatePersona(
  config: AgentConfig,
  personaId: string,
  input: { name: string; instructions: string }
): AgentConfig {
  const name = input.name.trim() || 'Persona';
  const instructions = input.instructions.trim();
  return {
    ...config,
    personas: config.personas.map((p) => {
      if (p.id !== personaId) {
        return p;
      }
      return {
        ...p,
        name,
        instructions,
        updatedAt: Date.now(),
      };
    }),
  };
}

/** Delete a persona. Presets can be removed locally; keeps at least one. */
export function deletePersona(
  config: AgentConfig,
  personaId: string
): AgentConfig {
  if (config.personas.length <= 1) {
    return config;
  }
  const personas = config.personas.filter((p) => p.id !== personaId);
  const activePersonaId =
    config.activePersonaId === personaId
      ? (personas[0]?.id ?? config.activePersonaId)
      : config.activePersonaId;
  return { ...config, personas, activePersonaId };
}

export function resetPersonaToPreset(
  config: AgentConfig,
  personaId: string
): AgentConfig {
  const preset = PERSONA_PRESETS.find((p) => p.id === personaId);
  if (!preset) {
    return config;
  }
  return updatePersona(config, personaId, {
    name: preset.name,
    instructions: preset.instructions,
  });
}
