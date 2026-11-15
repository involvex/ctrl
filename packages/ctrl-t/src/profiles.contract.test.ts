import { describe, expect, test } from 'bun:test';
import {
  createAgentProfile,
  listAgentProfiles,
  updateAgentProfile,
} from '@involvex/ctrl-i';
import { baseUrl } from './env';

describe('contract: agent profiles', () => {
  test('create → list → patch', async () => {
    const created = await createAgentProfile(baseUrl(), {
      name: 'contract-profile',
      instructions: 'You are a contract test profile.',
      toolNames: ['fs_list'],
      requireApprovalFor: [],
    });
    expect(created.id.length).toBeGreaterThan(0);
    expect(created.name).toBe('contract-profile');

    const listed = await listAgentProfiles(baseUrl());
    expect(listed.some((p) => p.id === created.id)).toBe(true);

    const patched = await updateAgentProfile(baseUrl(), created.id, {
      name: 'contract-profile-renamed',
      instructions: 'Updated instructions.',
    });
    expect(patched.name).toBe('contract-profile-renamed');
    expect(patched.instructions).toBe('Updated instructions.');
  });
});
