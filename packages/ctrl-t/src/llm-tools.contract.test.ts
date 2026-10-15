import { describe, expect, test } from 'bun:test';
import {
  createConversation,
  createWorkspace,
  streamChat,
} from '@involvex/ctrl-i';
import { type AgentEvent } from '@involvex/ctrl-s';
import { baseUrl } from './env';

describe('contract: LLM-native tool calling', () => {
  test('!call fs_list runs via mock provider tool loop', async () => {
    const ws = await createWorkspace(baseUrl(), 'llm-tools-ws');
    const conversation = await createConversation(baseUrl(), ws.id, 'llm');

    const events: AgentEvent[] = [];
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('llm tool stream timed out'));
      }, 15_000);

      streamChat(baseUrl(), conversation.id, '!call fs_list .', {
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

    expect(events.some((e) => e.type === 'tool.requested')).toBe(true);
    expect(events.some((e) => e.type === 'tool.completed')).toBe(true);
    expect(events.some((e) => e.type === 'approval.requested')).toBe(false);
    expect(
      events.some(
        (e) => e.type === 'message.delta' && e.text.includes('tool round')
      )
    ).toBe(true);
    expect(events.at(-1)?.type).toBe('run.completed');
  });

  test('!call shell requires approval then executes', async () => {
    const ws = await createWorkspace(baseUrl(), 'llm-shell-ws');
    const conversation = await createConversation(
      baseUrl(),
      ws.id,
      'llm-shell'
    );

    const events: AgentEvent[] = [];
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('llm shell stream timed out'));
      }, 15_000);

      const session = streamChat(
        baseUrl(),
        conversation.id,
        '!call shell echo llm-hello',
        {
          onEvent: (event) => {
            events.push(event);
            if (event.type === 'approval.requested') {
              session.resolveApproval(event.approvalId, 'approved');
            }
          },
          onError: (err) => {
            clearTimeout(timeout);
            reject(err);
          },
          onClose: () => {
            clearTimeout(timeout);
            resolve();
          },
        }
      );
    });

    expect(events.some((e) => e.type === 'approval.requested')).toBe(true);
    expect(events.some((e) => e.type === 'tool.completed')).toBe(true);
    const completed = events.find((e) => e.type === 'tool.completed');
    if (completed?.type === 'tool.completed') {
      const result = completed.result;
      expect(result && typeof result === 'object').toBe(true);
      if (result && typeof result === 'object' && 'stdout' in result) {
        expect(String(result.stdout)).toContain('llm-hello');
      }
    }
  });
});
