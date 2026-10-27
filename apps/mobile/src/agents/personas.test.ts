import { describe, expect, test } from 'bun:test';
import {
  createPersona,
  DEFAULT_AGENT_CONFIG,
  deletePersona,
  resetPersonaToPreset,
  updatePersona,
} from './config';

describe('persona CRUD', () => {
  test('create selects the new persona', () => {
    const next = createPersona(structuredClone(DEFAULT_AGENT_CONFIG), {
      name: 'Sales',
      instructions: 'Close deals.',
    });
    expect(next.personas[0]!.name).toBe('Sales');
    expect(next.activePersonaId).toBe(next.personas[0]!.id);
    expect(next.personas[0]!.updatedAt).toBeGreaterThan(0);
  });

  test('update stamps updatedAt', () => {
    let config = structuredClone(DEFAULT_AGENT_CONFIG);
    config = updatePersona(config, 'coding', {
      name: 'Coding pair+',
      instructions: 'Ship small diffs.',
    });
    const coding = config.personas.find((p) => p.id === 'coding')!;
    expect(coding.name).toBe('Coding pair+');
    expect(coding.instructions).toBe('Ship small diffs.');
    expect(coding.updatedAt).toBeGreaterThan(0);
  });

  test('delete keeps at least one and reassigns active', () => {
    let config = createPersona(structuredClone(DEFAULT_AGENT_CONFIG), {
      name: 'Temp',
      instructions: 'x',
    });
    const doomed = config.activePersonaId;
    config = deletePersona(config, doomed);
    expect(config.personas.some((p) => p.id === doomed)).toBe(false);
    expect(config.activePersonaId).not.toBe(doomed);
    const only = { ...config, personas: [config.personas[0]!] };
    expect(deletePersona(only, only.personas[0]!.id).personas).toHaveLength(1);
  });

  test('reset preset restores stock copy', () => {
    let config = updatePersona(structuredClone(DEFAULT_AGENT_CONFIG), 'pm', {
      name: 'PM hacked',
      instructions: 'nope',
    });
    config = resetPersonaToPreset(config, 'pm');
    expect(config.personas.find((p) => p.id === 'pm')!.name).toBe(
      'Project manager'
    );
  });
});
