import { describe, expect, test } from 'bun:test';
import {
  createConversation,
  createWorkspace,
  streamChat,
} from '@involvex/ctrl-i';
import { type AgentEvent } from '@involvex/ctrl-s';
import { baseUrl } from './env';

describe('contract: MCP stdio', () => {
  test('lists stdio demo MCP server', async () => {
    const res = await fetch(`${baseUrl()}/api/v1/mcp/servers`);
    expect(res.ok).toBe(true);
    const body: unknown = await res.json();
    expect(body && typeof body === 'object' && 'items' in body).toBe(true);
    if (body && typeof body === 'object' && 'items' in body) {
      const items = body.items;
      expect(Array.isArray(items)).toBe(true);
      if (Array.isArray(items)) {
        expect(
          items.some(
            (s) => s && typeof s === 'object' && 'id' in s && s.id === 'demo'
          )
        ).toBe(true);
      }
    }
  });

  test('mcp__demo__echo via /tool requires approval and echoes', async () => {
    const ws = await createWorkspace(baseUrl(), 'mcp-ws');
    const conversation = await createConversation(baseUrl(), ws.id, 'mcp');

    const events: AgentEvent[] = [];
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('mcp stream timed out'));
      }, 20_000);

      const session = streamChat(
        baseUrl(),
        conversation.id,
        '/tool mcp__demo__echo {"text":"stdio-hi"}',
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
    if (completed?.type === 'tool.completed') {
      expect(completed.result).toEqual({ echo: 'stdio-hi' });
    }
  });
});
