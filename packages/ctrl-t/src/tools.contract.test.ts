import { describe, expect, test } from 'bun:test';
import {
  createConversation,
  createWorkspace,
  streamChat,
} from '@involvex/ctrl-i';
import { type AgentEvent } from '@involvex/ctrl-s';
import { baseUrl } from './env';

describe('contract: tools + approval', () => {
  test('fs_list runs without approval and returns listing', async () => {
    const ws = await createWorkspace(baseUrl(), 'tools-ws');
    const conversation = await createConversation(baseUrl(), ws.id, 'tools');

    const events: AgentEvent[] = [];
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('tool stream timed out'));
      }, 15_000);

      streamChat(baseUrl(), conversation.id, '/tool fs_list .', {
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
    expect(events.at(-1)?.type).toBe('run.completed');
  });

  test('shell requires approval; deny stops execution', async () => {
    const ws = await createWorkspace(baseUrl(), 'approve-ws');
    const conversation = await createConversation(baseUrl(), ws.id, 'approve');

    const events: AgentEvent[] = [];
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('approval stream timed out'));
      }, 15_000);

      const session = streamChat(
        baseUrl(),
        conversation.id,
        '/tool shell echo hello-ctrl',
        {
          onEvent: (event) => {
            events.push(event);
            if (event.type === 'approval.requested') {
              session.resolveApproval(event.approvalId, 'denied');
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
    expect(
      events.some(
        (e) => e.type === 'approval.resolved' && e.decision === 'denied'
      )
    ).toBe(true);
    expect(events.some((e) => e.type === 'tool.started')).toBe(false);
    expect(events.at(-1)?.type).toBe('run.completed');
  });

  test('shell approve executes allowlisted command', async () => {
    const ws = await createWorkspace(baseUrl(), 'shell-ws');
    const conversation = await createConversation(baseUrl(), ws.id, 'shell');

    const events: AgentEvent[] = [];
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('shell stream timed out'));
      }, 15_000);

      const session = streamChat(
        baseUrl(),
        conversation.id,
        '/tool shell echo hello-ctrl',
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

    expect(events.some((e) => e.type === 'tool.completed')).toBe(true);
    const completed = events.find((e) => e.type === 'tool.completed');
    expect(completed?.type).toBe('tool.completed');
    if (completed?.type === 'tool.completed') {
      const result = completed.result as {
        stdout?: string;
        exitCode?: number;
      };
      expect(result.exitCode).toBe(0);
      expect(String(result.stdout)).toContain('hello-ctrl');
    }
  });
});
