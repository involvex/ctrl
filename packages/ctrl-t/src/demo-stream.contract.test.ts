import { describe, expect, test } from 'bun:test';
import { streamDemo } from '@involvex/ctrl-i';
import { type AgentEvent } from '@involvex/ctrl-s';
import { baseUrl } from './env';

describe('contract: GET /ws/v1/demo', () => {
  test('streams AgentEvent sequence in order', async () => {
    const events: AgentEvent[] = [];

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('demo stream timed out'));
      }, 10_000);

      streamDemo(baseUrl(), {
        onEvent: (event) => {
          events.push(event);
        },
        onError: (err) => {
          clearTimeout(timeout);
          reject(err);
        },
        onClose: () => {
          clearTimeout(timeout);
          resolve();
        },
      });
    });

    expect(events.length).toBeGreaterThanOrEqual(3);
    expect(events[0]?.type).toBe('run.started');
    expect(events.some((e) => e.type === 'message.delta')).toBe(true);
    expect(events.some((e) => e.type === 'usage.updated')).toBe(true);
    expect(events.at(-1)?.type).toBe('run.completed');

    const text = events
      .filter((e) => e.type === 'message.delta')
      .map((e) => (e.type === 'message.delta' ? e.text : ''))
      .join('');
    expect(text).toContain('ctrl');
    expect(text).toContain('stream');
  });
});
