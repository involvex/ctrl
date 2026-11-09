import {
  mcpServerConfigSchema,
  type McpServerConfig,
  type ToolCall,
  type ToolDefinition,
} from '@involvex/ctrl-s';
import type { ToolHandler, ToolRegistry } from '@involvex/ctrl-x';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { flattenMcpResult, McpSession } from './session';
import { loadPersistedMcp, parseMcpServersEnv } from './persist';

export type { McpServerConfig };

export type McpRemoteTool = ToolDefinition & {
  serverId: string;
};

/**
 * MCP client: stub tools and/or stdio JSON-RPC sessions.
 */
export class McpClient {
  private servers: McpServerConfig[];
  private readonly remotes = new Map<string, McpRemoteTool>();
  private readonly handlers = new Map<string, ToolHandler | undefined>();
  private readonly sessions = new Map<string, McpSession>();

  constructor(servers: McpServerConfig[] = []) {
    this.servers = servers.map((s) => mcpServerConfigSchema.parse(s));
  }

  listServers(): McpServerConfig[] {
    return this.servers.map((s) => ({ ...s, args: [...s.args] }));
  }

  /** Replace the full server list (does not connect or mount). */
  setServers(servers: McpServerConfig[]): void {
    this.servers = servers.map((s) => mcpServerConfigSchema.parse(s));
  }

  upsertServer(server: McpServerConfig): McpServerConfig {
    const next = mcpServerConfigSchema.parse(server);
    const idx = this.servers.findIndex((s) => s.id === next.id);
    if (idx >= 0) {
      this.servers[idx] = next;
    } else {
      this.servers.push(next);
    }
    return { ...next, args: [...next.args] };
  }

  removeServer(id: string): boolean {
    const before = this.servers.length;
    this.servers = this.servers.filter((s) => s.id !== id);
    return this.servers.length < before;
  }

  /** Register a remote tool descriptor (used by stubs / discovery). */
  registerRemoteTool(tool: McpRemoteTool, execute?: ToolHandler): void {
    this.remotes.set(`${tool.serverId}:${tool.name}`, tool);
    this.handlers.set(`${tool.serverId}:${tool.name}`, execute);
  }

  listRemoteTools(): McpRemoteTool[] {
    return [...this.remotes.values()];
  }

  clearRemotes(): void {
    this.remotes.clear();
    this.handlers.clear();
  }

  /**
   * Connect configured stdio servers, discover tools, and register handlers.
   * Servers without a command are skipped (stub-only).
   */
  async connectConfigured(): Promise<void> {
    for (const server of this.servers) {
      const command = server.command.trim();
      if (!command) {
        continue;
      }
      const session = new McpSession(server.id, command, server.args);
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

  /**
   * When no stdio servers are configured, register the in-process demo echo
   * stub so contracts and first-run stay deterministic.
   */
  ensureDemoStubIfEmpty(): void {
    const hasCommand = this.servers.some((s) => s.command.trim().length > 0);
    if (hasCommand || this.remotes.size > 0) {
      return;
    }
    if (!this.servers.some((s) => s.id === 'demo')) {
      this.servers.push(
        mcpServerConfigSchema.parse({
          id: 'demo',
          name: 'Demo MCP',
          command: '',
          args: [],
        })
      );
    }
    this.registerRemoteTool(
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

  /** Unmount all `mcp__*` tools, close sessions, clear remotes. */
  async unmount(registry: ToolRegistry): Promise<void> {
    registry.unregisterWhere((name) => name.startsWith('mcp__'));
    await this.close();
    this.clearRemotes();
  }

  /**
   * Full reload: unmount → reconnect configured → ensure stub if empty → mount.
   */
  async reload(registry: ToolRegistry): Promise<void> {
    await this.unmount(registry);
    await this.connectConfigured();
    this.ensureDemoStubIfEmpty();
    this.mountOn(registry);
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
  const client = new McpClient([
    { id: 'demo', name: 'Demo MCP', command: '', args: [] },
  ]);
  client.ensureDemoStubIfEmpty();
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

export type ResolveMcpOptions = {
  /** Absolute path to data/mcp.json */
  persistPath?: string;
};

/**
 * Resolve MCP client: `data/mcp.json` → `CTRL_MCP_SERVERS` → stdio demo
 * (`CTRL_MCP_STDIO=1`) → in-process stub.
 */
export function resolveMcpClientFromEnv(
  options: ResolveMcpOptions = {}
): McpClient {
  if (options.persistPath) {
    const fromDisk = loadPersistedMcp(options.persistPath);
    if (fromDisk && fromDisk.length > 0) {
      return new McpClient(fromDisk);
    }
  }
  const fromEnv = parseMcpServersEnv(process.env['CTRL_MCP_SERVERS']);
  if (fromEnv && fromEnv.length > 0) {
    return new McpClient(fromEnv);
  }
  if (process.env['CTRL_MCP_STDIO'] === '1') {
    return createStdioDemoMcpClient();
  }
  return createDemoMcpClient();
}
