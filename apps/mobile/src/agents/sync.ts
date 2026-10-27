import {
  checkHealth,
  createAgentProfile,
  listAgentProfiles,
  setClientAuth,
  updateAgentProfile,
  type AgentProfile,
} from '@involvex/ctrl-i';
import { loadSavedConnection } from '../connection/storage';
import {
  loadAgentConfig,
  PERSONA_PRESETS,
  saveAgentConfig,
  type AgentConfig,
  type AgentPersona,
} from './config';

export type AgentSyncResult =
  | {
      ok: true;
      config: AgentConfig;
      pulled: number;
      pushed: number;
    }
  | { ok: false; reason: string; config: AgentConfig };

function normName(name: string): string {
  return name.trim().toLowerCase();
}

function personaFromProfile(profile: AgentProfile): AgentPersona {
  return {
    id: profile.id,
    name: profile.name,
    instructions: profile.instructions,
    gatewayProfileId: profile.id,
    updatedAt: profile.updatedAt,
  };
}

/**
 * Merge remote gateway profiles into local personas (by gateway id or name).
 * Remote wins when its updatedAt is newer (or local has no updatedAt).
 */
export function mergeProfilesIntoConfig(
  config: AgentConfig,
  remote: AgentProfile[]
): { config: AgentConfig; pulled: number } {
  let pulled = 0;
  const personas = config.personas.map((p) => ({ ...p }));
  const byGateway = new Map(
    personas
      .filter((p) => p.gatewayProfileId)
      .map((p) => [p.gatewayProfileId!, p] as const)
  );
  const byName = new Map(personas.map((p) => [normName(p.name), p]));

  for (const profile of remote) {
    const existing =
      byGateway.get(profile.id) ?? byName.get(normName(profile.name));
    if (!existing) {
      const next = personaFromProfile(profile);
      personas.push(next);
      byGateway.set(profile.id, next);
      byName.set(normName(profile.name), next);
      pulled += 1;
      continue;
    }
    const localTs = existing.updatedAt ?? 0;
    if (profile.updatedAt >= localTs) {
      const before = `${existing.name}\0${existing.instructions}`;
      existing.name = profile.name;
      existing.instructions = profile.instructions;
      existing.gatewayProfileId = profile.id;
      existing.updatedAt = profile.updatedAt;
      const after = `${existing.name}\0${existing.instructions}`;
      if (before !== after) {
        pulled += 1;
      }
    } else if (!existing.gatewayProfileId) {
      existing.gatewayProfileId = profile.id;
    }
  }

  return { config: { ...config, personas }, pulled };
}

function isPresetId(id: string): boolean {
  return PERSONA_PRESETS.some((p) => p.id === id);
}

/**
 * Push local personas to the gateway. Presets are pushed once (create) so the
 * PC sees the same starter set; later edits PATCH when linked.
 */
export async function pushPersonasToGateway(
  baseUrl: string,
  config: AgentConfig,
  remote: AgentProfile[]
): Promise<{ config: AgentConfig; pushed: number }> {
  let pushed = 0;
  const remoteById = new Map(remote.map((p) => [p.id, p]));
  const remoteByName = new Map(remote.map((p) => [normName(p.name), p]));
  const personas = config.personas.map((p) => ({ ...p }));

  for (const persona of personas) {
    const linked =
      (persona.gatewayProfileId
        ? remoteById.get(persona.gatewayProfileId)
        : undefined) ?? remoteByName.get(normName(persona.name));

    if (linked) {
      persona.gatewayProfileId = linked.id;
      const changed =
        linked.name !== persona.name ||
        linked.instructions !== persona.instructions;
      if (changed) {
        const updated = await updateAgentProfile(baseUrl, linked.id, {
          name: persona.name,
          instructions: persona.instructions,
        });
        persona.updatedAt = updated.updatedAt;
        persona.gatewayProfileId = updated.id;
        remoteById.set(updated.id, updated);
        remoteByName.set(normName(updated.name), updated);
        pushed += 1;
      }
      continue;
    }

    // Skip untouched stock presets that already exist under another name path
    // (already handled). Create anything without a remote match.
    if (isPresetId(persona.id) && remoteByName.has(normName(persona.name))) {
      const existing = remoteByName.get(normName(persona.name))!;
      persona.gatewayProfileId = existing.id;
      continue;
    }

    const created = await createAgentProfile(baseUrl, {
      name: persona.name,
      instructions: persona.instructions,
    });
    persona.gatewayProfileId = created.id;
    persona.updatedAt = created.updatedAt;
    remoteById.set(created.id, created);
    remoteByName.set(normName(created.name), created);
    pushed += 1;
  }

  return { config: { ...config, personas }, pushed };
}

export async function syncAgentProfilesWithGateway(
  config?: AgentConfig
): Promise<AgentSyncResult> {
  const local = config ?? (await loadAgentConfig());
  const saved = await loadSavedConnection();
  if (!saved) {
    return { ok: false, reason: 'not paired', config: local };
  }
  setClientAuth({ token: saved.token || undefined });

  try {
    await checkHealth(saved.gatewayUrl);
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : 'PC offline',
      config: local,
    };
  }

  try {
    const remote = await listAgentProfiles(saved.gatewayUrl);
    const pulled = mergeProfilesIntoConfig(local, remote);
    const pushed = await pushPersonasToGateway(
      saved.gatewayUrl,
      pulled.config,
      remote
    );
    await saveAgentConfig(pushed.config);
    return {
      ok: true,
      config: pushed.config,
      pulled: pulled.pulled,
      pushed: pushed.pushed,
    };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
      config: local,
    };
  }
}
