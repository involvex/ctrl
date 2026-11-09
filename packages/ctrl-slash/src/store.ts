import {
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import {
  createSkillInputSchema,
  persistedSkillsStateSchema,
  skillManifestSchema,
  updateSkillInputSchema,
  type AgentProfile,
  type CreateSkillInput,
  type PersistedSkillsState,
  type SkillManifest,
  type UpdateSkillInput,
} from '@involvex/ctrl-s';
import { BUILTIN_SKILLS } from './builtins';

export function skillsDir(dataDir: string): string {
  return path.join(dataDir, 'skills');
}

export function skillsStatePath(dataDir: string): string {
  return path.join(dataDir, 'skills.json');
}

function loadEnabledIds(statePath: string): Set<string> {
  try {
    const raw = readFileSync(statePath, 'utf8');
    const parsed = persistedSkillsStateSchema.parse(JSON.parse(raw) as unknown);
    return new Set(parsed.enabled);
  } catch {
    return new Set();
  }
}

function saveEnabledIds(statePath: string, enabled: Set<string>): void {
  const payload: PersistedSkillsState = {
    version: 1,
    enabled: [...enabled].sort(),
  };
  mkdirSync(path.dirname(statePath), { recursive: true });
  writeFileSync(statePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function readUserSkill(dir: string, id: string): SkillManifest | null {
  const skillRoot = path.join(dir, id);
  try {
    if (!statSync(skillRoot).isDirectory()) {
      return null;
    }
  } catch {
    return null;
  }
  const manifestPath = path.join(skillRoot, 'manifest.json');
  const mdPath = path.join(skillRoot, 'SKILL.md');
  let base: Partial<SkillManifest> = { id, name: id };
  try {
    const raw = readFileSync(manifestPath, 'utf8');
    base = skillManifestSchema
      .partial()
      .parse(JSON.parse(raw) as unknown) as Partial<SkillManifest>;
  } catch {
    // optional manifest
  }
  let instructions =
    typeof base.instructions === 'string' ? base.instructions : '';
  try {
    instructions = readFileSync(mdPath, 'utf8');
  } catch {
    // optional SKILL.md
  }
  return skillManifestSchema.parse({
    id,
    name: base.name ?? id,
    description: base.description ?? '',
    instructions,
    toolNames: base.toolNames ?? [],
    enabled: false,
    builtin: false,
  });
}

export class SkillStore {
  private readonly root: string;
  private readonly statePath: string;
  private enabled: Set<string>;

  constructor(dataDir: string) {
    this.root = skillsDir(dataDir);
    this.statePath = skillsStatePath(dataDir);
    mkdirSync(this.root, { recursive: true });
    this.enabled = loadEnabledIds(this.statePath);
  }

  list(): SkillManifest[] {
    const byId = new Map<string, SkillManifest>();
    for (const builtin of BUILTIN_SKILLS) {
      byId.set(builtin.id, {
        ...builtin,
        enabled: this.enabled.has(builtin.id),
      });
    }
    let entries: string[] = [];
    try {
      entries = readdirSync(this.root);
    } catch {
      entries = [];
    }
    for (const id of entries) {
      if (byId.has(id)) {
        continue;
      }
      const skill = readUserSkill(this.root, id);
      if (skill) {
        byId.set(id, { ...skill, enabled: this.enabled.has(id) });
      }
    }
    return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  get(id: string): SkillManifest | undefined {
    return this.list().find((s) => s.id === id);
  }

  create(input: CreateSkillInput): SkillManifest {
    const parsed = createSkillInputSchema.parse(input);
    if (BUILTIN_SKILLS.some((s) => s.id === parsed.id)) {
      throw new Error(`skill id ${parsed.id} is reserved for a builtin`);
    }
    if (this.get(parsed.id) && !this.get(parsed.id)?.builtin) {
      const existing = readUserSkill(this.root, parsed.id);
      if (existing) {
        throw new Error(`skill ${parsed.id} already exists`);
      }
    }
    const skill = skillManifestSchema.parse({
      id: parsed.id,
      name: parsed.name,
      description: parsed.description ?? '',
      instructions: parsed.instructions ?? '',
      toolNames: parsed.toolNames ?? [],
      enabled: parsed.enabled ?? false,
      builtin: false,
    });
    const skillRoot = path.join(this.root, skill.id);
    mkdirSync(skillRoot, { recursive: true });
    writeFileSync(
      path.join(skillRoot, 'manifest.json'),
      `${JSON.stringify(
        {
          id: skill.id,
          name: skill.name,
          description: skill.description,
          toolNames: skill.toolNames,
        },
        null,
        2
      )}\n`,
      'utf8'
    );
    writeFileSync(path.join(skillRoot, 'SKILL.md'), skill.instructions, 'utf8');
    if (skill.enabled) {
      this.enabled.add(skill.id);
      saveEnabledIds(this.statePath, this.enabled);
    }
    return { ...skill, enabled: this.enabled.has(skill.id) };
  }

  update(id: string, input: UpdateSkillInput): SkillManifest {
    const patch = updateSkillInputSchema.parse(input);
    const current = this.get(id);
    if (!current) {
      throw new Error(`skill ${id} not found`);
    }
    if (current.builtin) {
      if (
        patch.name !== undefined ||
        patch.description !== undefined ||
        patch.instructions !== undefined ||
        patch.toolNames !== undefined
      ) {
        throw new Error(
          'builtin skill content is read-only; toggle enabled only'
        );
      }
      if (patch.enabled !== undefined) {
        return this.setEnabled(id, patch.enabled);
      }
      return current;
    }
    const next = skillManifestSchema.parse({
      ...current,
      ...patch,
      id: current.id,
      builtin: false,
      enabled: patch.enabled ?? current.enabled,
    });
    const skillRoot = path.join(this.root, id);
    mkdirSync(skillRoot, { recursive: true });
    writeFileSync(
      path.join(skillRoot, 'manifest.json'),
      `${JSON.stringify(
        {
          id: next.id,
          name: next.name,
          description: next.description,
          toolNames: next.toolNames,
        },
        null,
        2
      )}\n`,
      'utf8'
    );
    writeFileSync(path.join(skillRoot, 'SKILL.md'), next.instructions, 'utf8');
    if (patch.enabled !== undefined) {
      if (patch.enabled) {
        this.enabled.add(id);
      } else {
        this.enabled.delete(id);
      }
      saveEnabledIds(this.statePath, this.enabled);
    }
    return { ...next, enabled: this.enabled.has(id) };
  }

  setEnabled(id: string, enabled: boolean): SkillManifest {
    const current = this.get(id);
    if (!current) {
      throw new Error(`skill ${id} not found`);
    }
    if (enabled) {
      this.enabled.add(id);
    } else {
      this.enabled.delete(id);
    }
    saveEnabledIds(this.statePath, this.enabled);
    return { ...current, enabled };
  }

  delete(id: string): boolean {
    const current = this.get(id);
    if (!current) {
      return false;
    }
    if (current.builtin) {
      throw new Error('cannot delete builtin skill');
    }
    rmSync(path.join(this.root, id), { recursive: true, force: true });
    this.enabled.delete(id);
    saveEnabledIds(this.statePath, this.enabled);
    return true;
  }

  enabledSkills(): SkillManifest[] {
    return this.list().filter((s) => s.enabled);
  }
}

/**
 * Merge enabled skill instructions + tool allowlists into a profile copy.
 * Empty profile.toolNames means "all tools"; skills only add when the profile
 * already restricts tools, or when a skill lists tools and the profile is open
 * we leave toolNames empty (all allowed).
 */
export function applySkillsToProfile(
  profile: AgentProfile,
  skills: SkillManifest[]
): AgentProfile {
  const enabled = skills.filter((s) => s.enabled);
  if (enabled.length === 0) {
    return profile;
  }
  const blocks = enabled
    .map((s) => {
      const body = s.instructions.trim();
      if (!body) {
        return '';
      }
      return `## Skill: ${s.name}\n${body}`;
    })
    .filter(Boolean);
  const instructions =
    blocks.length === 0
      ? profile.instructions
      : [profile.instructions.trim(), ...blocks].filter(Boolean).join('\n\n');

  const skillTools = new Set<string>();
  for (const s of enabled) {
    for (const name of s.toolNames) {
      skillTools.add(name);
    }
  }

  let toolNames = profile.toolNames;
  if (skillTools.size > 0) {
    if (profile.toolNames.length === 0) {
      // Profile allows all tools already — skill tool hints are informational only.
      toolNames = profile.toolNames;
    } else {
      toolNames = [...new Set([...profile.toolNames, ...skillTools])];
    }
  }

  return {
    ...profile,
    instructions,
    toolNames,
  };
}
