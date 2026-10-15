import { describe, expect, test } from 'bun:test';
import { createStdioDemoMcpClient, demoMcpServerScript } from './client';
import { flattenMcpResult, McpSession } from './session';

describe('MCP stdio JSON-RPC', () => {
  test('demo server script exists', () => {
    const script = demoMcpServerScript();
    expect(Bun.file(script).size).toBeGreaterThan(0);
  });

  test('initialize → tools/list → tools/call echo', async () => {
    const session = new McpSession('demo', process.execPath, [
      demoMcpServerScript(),
    ]);
    try {
      await session.connect();
      const tools = await session.listTools();
      expect(tools.some((t) => t.name === 'echo')).toBe(true);
      const result = await session.callTool('echo', { text: 'ping-mcp' });
      const flat = flattenMcpResult(result);
      expect(flat).toEqual({ echo: 'ping-mcp' });
    } finally {
      await session.close();
    }
  });

  test('createStdioDemoMcpClient discovers and mounts echo', async () => {
    const client = createStdioDemoMcpClient();
    try {
      await client.connectConfigured();
      const tools = client.listRemoteTools();
      expect(
        tools.some((t) => t.name === 'echo' && t.serverId === 'demo')
      ).toBe(true);
      const echo = tools.find((t) => t.name === 'echo');
      expect(echo).toBeDefined();
    } finally {
      await client.close();
    }
  });
});
