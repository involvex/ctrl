import type { ToolCall, ToolDefinition } from '@involvex/ctrl-s';
import type { ToolHandler, ToolRegistry } from '@involvex/ctrl-x';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { flattenMcpResult, McpSession } from './session';

export type McpServerConfig = {
  id: string;
  /** Display name */
  name: string;
  /** Command to spawn (stdio transport). Empty = stub/disabled. */
  command?: string;
  args?: string[];
};

export type McpRemoteTool = ToolDefinition & {
  serverId: string;
};

/**
 * MCP client: stub tools and/or stdio JSON-RPC sessions.
 */
export class McpClient {
  private readonly remotes = new Map<string, McpRemoteTool>();
  private readonly handlers = new Map<string, ToolHandler | undefined>();
  private readonly sessions = new Map<string, McpSession>();

  constructor(private readonly servers: McpServerConfig[] = []) {}

  listServers(): McpServerConfig[] {
    return [...this.servers];
  }

  /** Register a remote tool descriptor (used by stubs / discovery). */
  registerRemoteTool(tool: McpRemoteTool, execute?: ToolHandler): void {
    this.remotes.set(`${tool.serverId}:${tool.name}`, tool);
    this.handlers.set(`${tool.serverId}:${tool.name}`, execute);
  }

  listRemoteTools(): McpRemoteTool[] {
    return [...this.remotes.values()];
  }

  /**
   * Connect configured stdio servers, discover tools, and register handlers.
   * Servers without a command are skipped (stub-only).
   */
  async connectConfigured(): Promise<void> {
    for (const server of this.servers) {
      const command = server.command?.trim();
      if (!command) {
        continue;
      }
      const session = new McpSession(server.id, command, server.args ?? []);
      await session.connect();
      this.sessions.set(server.id, session);
      const tools = await session.listTools();
      for (const tool of tools) {
        const def = session.toToolDefinition(tool);
        this.registerRemoteTool(
          { ...def, serverId: server.id },
          async (call) => {
            const args: Record<string, unknown> = {};
            if (
              call.arguments &&
              typeof call.arguments === 'object' &&
              !Array.isArray(call.arguments)
            ) {
              for (const [k, v] of Object.entries(call.arguments)) {
                args[k] = v;
              }
            }
            const result = await session.callTool(tool.name, args);
            return flattenMcpResult(result);
          }
        );
      }
    }
  }

  /** Mount discovered/stub MCP tools onto the shared ToolRegistry with `mcp__` prefix. */
  mountOn(registry: ToolRegistry): void {
    for (const tool of this.remotes.values()) {
      const key = `${tool.serverId}:${tool.name}`;
      const handler = this.handlers.get(key);
      const prefixed: ToolDefinition = {
        ...tool,
        name: `mcp__${tool.serverId}__${tool.name}`,
        description: `[MCP:${tool.serverId}] ${tool.description}`,
        requiresApproval: tool.requiresApproval ?? true,
        risk: tool.risk ?? 'high',
        parameters: tool.parameters ?? {},
      };
      registry.register(prefixed, (call, ctx) => {
        if (!handler) {
          return Promise.reject(
            new Error(
              `MCP tool ${tool.name} on ${tool.serverId} has no handler (stdio transport not connected)`
            )
          );
        }
        const inner: ToolCall = {
          id: call.id,
          name: tool.name,
          arguments: call.arguments,
        };
        return handler(inner, ctx);
      });
    }
  }

  async close(): Promise<void> {
    for (const session of this.sessions.values()) {
      await session.close();
    }
    this.sessions.clear();
  }
}

/** Absolute path to the bundled demo MCP stdio server script. */
export function demoMcpServerScript(): string {
  return path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../scripts/demo-mcp-server.ts'
  );
}

/**
 * Create an MCP client with the in-process echo stub (no subprocess).
 * Prefer {@link createStdioDemoMcpClient} when you need real JSON-RPC.
 */
export function createDemoMcpClient(): McpClient {
  const client = new McpClient([{ id: 'demo', name: 'Demo MCP', command: '' }]);
  client.registerRemoteTool(
    {
      serverId: 'demo',
      name: 'echo',
      description: 'Echo a string via the demo MCP stub',
      parameters: {
        type: 'object',
        properties: { text: { type: 'string' } },
        required: ['text'],
      },
      requiresApproval: true,
      risk: 'low',
    },
    (call) => {
      let text = '';
      if (
        call.arguments &&
        typeof call.arguments === 'object' &&
        'text' in call.arguments
      ) {
        const value = (call.arguments as { text?: unknown }).text;
        text = typeof value === 'string' ? value : '';
      }
      return Promise.resolve({ echo: text });
    }
  );
  return client;
}

/**
 * MCP client that spawns the bundled demo server over stdio JSON-RPC.
 * Call {@link McpClient.connectConfigured} before {@link McpClient.mountOn}.
 */
export function createStdioDemoMcpClient(): McpClient {
  return new McpClient([
    {
      id: 'demo',
      name: 'Demo MCP (stdio)',
      command: process.execPath,
      args: [demoMcpServerScript()],
    },
  ]);
}

/**
 * Parse `CTRL_MCP_SERVERS` JSON env, or fall back to stdio demo when
 * `CTRL_MCP_STDIO=1`, else the in-process stub.
 */
export function resolveMcpClientFromEnv(): McpClient {
  const raw = process.env['CTRL_MCP_SERVERS']?.trim();
  if (raw) {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error('CTRL_MCP_SERVERS must be a JSON array');
    }
    const servers: McpServerConfig[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') {
        continue;
      }
      if (
        !('id' in item) ||
        !('name' in item) ||
        typeof item.id !== 'string' ||
        typeof item.name !== 'string'
      ) {
        continue;
      }
      servers.push({
        id: item.id,
        name: item.name,
        command:
          'command' in item && typeof item.command === 'string'
            ? item.command
            : '',
        args:
          'args' in item && Array.isArray(item.args)
            ? item.args.filter(
                (a: unknown): a is string => typeof a === 'string'
              )
            : [],
      });
    }
    return new McpClient(servers);
  }
  if (process.env['CTRL_MCP_STDIO'] === '1') {
    return createStdioDemoMcpClient();
  }
  return createDemoMcpClient();
}
