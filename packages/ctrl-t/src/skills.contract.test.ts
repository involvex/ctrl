import { describe, expect, test } from 'bun:test';
import { listSkills, updateSkill } from '@involvex/ctrl-i';
import { baseUrl } from './env';

describe('contract: skills', () => {
  test('lists builtin knowledge-assistant', async () => {
    const skills = await listSkills(baseUrl());
    const ka = skills.find((s) => s.id === 'knowledge-assistant');
    expect(ka).toBeDefined();
    expect(ka?.builtin).toBe(true);
  });

  test('can enable and disable a skill', async () => {
    const enabled = await updateSkill(baseUrl(), 'knowledge-assistant', {
      enabled: true,
    });
    expect(enabled.enabled).toBe(true);

    const disabled = await updateSkill(baseUrl(), 'knowledge-assistant', {
      enabled: false,
    });
    expect(disabled.enabled).toBe(false);
  });
});
