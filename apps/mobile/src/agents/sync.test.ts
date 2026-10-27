import { describe, expect, test } from 'bun:test';
import type { AgentProfile } from '@involvex/ctrl-i';
import { DEFAULT_AGENT_CONFIG } from './config';
import { mergeProfilesIntoConfig } from './sync';

function profile(
  partial: Partial<AgentProfile> & Pick<AgentProfile, 'id' | 'name'>
): AgentProfile {
  const now = Date.now();
  return {
    instructions: '',
    toolNames: [],
    requireApprovalFor: [],
    runTimeoutMs: 60_000,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

describe('agent profile merge', () => {
  test('adds remote-only profiles', () => {
    const remote = [
      profile({
        id: 'ap_1',
        name: 'Research',
        instructions: 'Dig deep.',
        updatedAt: 100,
      }),
    ];
    const { config, pulled } = mergeProfilesIntoConfig(
      structuredClone(DEFAULT_AGENT_CONFIG),
      remote
    );
    expect(pulled).toBe(1);
    expect(config.personas.some((p) => p.name === 'Research')).toBe(true);
    expect(
      config.personas.find((p) => p.name === 'Research')?.gatewayProfileId
    ).toBe('ap_1');
  });

  test('remote newer updates matching name', () => {
    const config = structuredClone(DEFAULT_AGENT_CONFIG);
    const concise = config.personas.find((p) => p.id === 'concise')!;
    concise.updatedAt = 10;
    concise.instructions = 'old';
    const { config: next, pulled } = mergeProfilesIntoConfig(config, [
      profile({
        id: 'ap_concise',
        name: 'Concise assistant',
        instructions: 'new from pc',
        updatedAt: 50,
      }),
    ]);
    expect(pulled).toBe(1);
    const updated = next.personas.find((p) => p.id === 'concise')!;
    expect(updated.instructions).toBe('new from pc');
    expect(updated.gatewayProfileId).toBe('ap_concise');
  });

  test('local newer keeps instructions', () => {
    const config = structuredClone(DEFAULT_AGENT_CONFIG);
    const concise = config.personas.find((p) => p.id === 'concise')!;
    concise.updatedAt = 90;
    concise.instructions = 'phone wins';
    const { config: next, pulled } = mergeProfilesIntoConfig(config, [
      profile({
        id: 'ap_concise',
        name: 'Concise assistant',
        instructions: 'pc stale',
        updatedAt: 20,
      }),
    ]);
    expect(pulled).toBe(0);
    expect(next.personas.find((p) => p.id === 'concise')!.instructions).toBe(
      'phone wins'
    );
    expect(
      next.personas.find((p) => p.id === 'concise')!.gatewayProfileId
    ).toBe('ap_concise');
  });
});
