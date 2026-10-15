import type { ToolCall, ToolDefinition } from '@involvex/ctrl-s';
import type { ToolHandler, ToolRegistry } from '@involvex/ctrl-x';

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
 * Phase 2 MCP client scaffold.
 *
 * Real stdio JSON-RPC transport lands next; for now we expose a registry
 * bridge so MCP-shaped tools can be registered and audited like builtins.
 */
export class McpClient {
  private readonly remotes = new Map<string, McpRemoteTool>();

  constructor(private readonly servers: McpServerConfig[] = []) {}

  listServers(): McpServerConfig[] {
    return [...this.servers];
  }

  private readonly handlers = new Map<string, ToolHandler | undefined>();

  /** Register a remote tool descriptor (used by stubs / future discovery). */
  registerRemoteTool(tool: McpRemoteTool, execute?: ToolHandler): void {
    this.remotes.set(`${tool.serverId}:${tool.name}`, tool);
    this.handlers.set(`${tool.serverId}:${tool.name}`, execute);
  }

  listRemoteTools(): McpRemoteTool[] {
    return [...this.remotes.values()];
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
}

/** Create a demo MCP stub server with one safe echo tool (for contracts/UI). */
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
      const args =
        call.arguments &&
        typeof call.arguments === 'object' &&
        'text' in call.arguments
          ? String((call.arguments as { text: unknown }).text ?? '')
          : '';
      return Promise.resolve({ echo: args });
    }
  );
  return client;
}
