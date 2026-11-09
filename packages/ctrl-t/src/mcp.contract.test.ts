import { describe, expect, test } from 'bun:test';
import {
  createConversation,
  createWorkspace,
  listMcpServers,
  listTools,
  reloadMcp,
  streamChat,
  upsertMcpServer,
} from '@involvex/ctrl-i';
import { type AgentEvent } from '@involvex/ctrl-s';
import { baseUrl } from './env';

describe('contract: MCP stdio', () => {
  test('lists stdio demo MCP server', async () => {
    const items = await listMcpServers(baseUrl());
    expect(items.some((s) => s.id === 'demo')).toBe(true);
  });

  test('upsert + reload keeps demo echo tool', async () => {
    await upsertMcpServer(baseUrl(), {
      id: 'demo',
      name: 'Demo MCP',
      command: '',
      args: [],
    });
    const reloaded = await reloadMcp(baseUrl());
    expect(reloaded.ok).toBe(true);
    const tools = await listTools(baseUrl());
    expect(tools.some((t) => t.name === 'mcp__demo__echo')).toBe(true);
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
