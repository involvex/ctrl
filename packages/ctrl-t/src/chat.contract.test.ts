import { describe, expect, test } from 'bun:test';
import {
  createConversation,
  createWorkspace,
  listMessages,
  streamChat,
} from '@involvex/ctrl-i';
import { type AgentEvent } from '@involvex/ctrl-s';
import { baseUrl } from './env';

describe('contract: chat MVP', () => {
  test('workspace → conversation → streamed mock reply persists', async () => {
    const ws = await createWorkspace(baseUrl(), 'contract-ws');
    expect(ws.name).toBe('contract-ws');

    const conversation = await createConversation(
      baseUrl(),
      ws.id,
      'contract-chat'
    );
    expect(conversation.workspaceId).toBe(ws.id);

    const events: AgentEvent[] = [];
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('chat stream timed out'));
      }, 10_000);

      streamChat(baseUrl(), conversation.id, 'hello ctrl', {
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

    expect(events[0]?.type).toBe('run.started');
    expect(events.at(-1)?.type).toBe('run.completed');

    const messages = await listMessages(baseUrl(), conversation.id);
    expect(messages.length).toBeGreaterThanOrEqual(2);
    expect(
      messages.some((m) => m.role === 'user' && m.content === 'hello ctrl')
    ).toBe(true);
    expect(
      messages.some(
        (m) => m.role === 'assistant' && m.content.includes('mock: hello ctrl')
      )
    ).toBe(true);
  });
});
