import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AgentProfile } from '@involvex/ctrl-s';
import { applySkillsToProfile, SkillStore } from './store';

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tempDataDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'ctrl-slash-'));
  dirs.push(dir);
  return dir;
}

function baseProfile(over: Partial<AgentProfile> = {}): AgentProfile {
  const now = Date.now();
  return {
    id: 'p1',
    name: 'default',
    instructions: 'Be helpful.',
    toolNames: [],
    requireApprovalFor: [],
    runTimeoutMs: 60_000,
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

describe('SkillStore', () => {
  test('lists builtin knowledge-assistant', () => {
    const store = new SkillStore(tempDataDir());
    const skills = store.list();
    const ka = skills.find((s) => s.id === 'knowledge-assistant');
    expect(ka).toBeDefined();
    expect(ka?.builtin).toBe(true);
    expect(ka?.enabled).toBe(false);
  });

  test('enable persists across reload', () => {
    const dataDir = tempDataDir();
    const store = new SkillStore(dataDir);
    store.setEnabled('knowledge-assistant', true);
    const again = new SkillStore(dataDir);
    expect(again.get('knowledge-assistant')?.enabled).toBe(true);
  });

  test('create user skill and update', () => {
    const store = new SkillStore(tempDataDir());
    const created = store.create({
      id: 'local-notes',
      name: 'Local notes',
      instructions: 'Prefer short bullets.',
      enabled: true,
    });
    expect(created.enabled).toBe(true);
    const updated = store.update('local-notes', {
      instructions: 'Prefer numbered lists.',
    });
    expect(updated.instructions).toContain('numbered');
  });
});

describe('applySkillsToProfile', () => {
  test('appends enabled skill instructions', () => {
    const profile = baseProfile();
    const next = applySkillsToProfile(profile, [
      {
        id: 'knowledge-assistant',
        name: 'Knowledge assistant',
        description: '',
        instructions: 'Search knowledge first.',
        toolNames: [],
        enabled: true,
        builtin: true,
      },
    ]);
    expect(next.instructions).toContain('Be helpful.');
    expect(next.instructions).toContain('Skill: Knowledge assistant');
    expect(next.instructions).toContain('Search knowledge first.');
  });

  test('unions toolNames when profile is restricted', () => {
    const profile = baseProfile({ toolNames: ['shell'] });
    const next = applySkillsToProfile(profile, [
      {
        id: 's1',
        name: 'S1',
        description: '',
        instructions: '',
        toolNames: ['fs_read'],
        enabled: true,
        builtin: false,
      },
    ]);
    expect(next.toolNames.sort()).toEqual(['fs_read', 'shell']);
  });
});
