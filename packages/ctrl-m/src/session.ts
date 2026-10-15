import type { ToolDefinition } from '@involvex/ctrl-s';
import { JsonRpcStdioTransport } from './stdio';

const PROTOCOL_VERSION = '2024-11-05';

export type McpToolDescriptor = {
  name: string;
  description?: string;
  inputSchema?: {
    type?: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
};

export type McpCallResult = {
  content?: Array<{ type?: string; text?: string }>;
  isError?: boolean;
  structuredContent?: unknown;
};

/**
 * One connected MCP server session over stdio JSON-RPC.
 */
export class McpSession {
  private transport: JsonRpcStdioTransport | null = null;
  private connected = false;

  constructor(
    readonly serverId: string,
    private readonly command: string,
    private readonly args: string[] = []
  ) {}

  get isConnected(): boolean {
    return this.connected;
  }

  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }
    this.transport = new JsonRpcStdioTransport(this.command, this.args);
    await this.transport.request('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'involvex-ctrl', version: '0.0.1' },
    });
    this.transport.notify('notifications/initialized', {});
    this.connected = true;
  }

  async listTools(): Promise<McpToolDescriptor[]> {
    this.requireTransport();
    const result: unknown = await this.transport!.request('tools/list', {});
    if (!result || typeof result !== 'object' || !('tools' in result)) {
      return [];
    }
    const tools = result.tools;
    if (!Array.isArray(tools)) {
      return [];
    }
    const out: McpToolDescriptor[] = [];
    for (const item of tools) {
      if (!item || typeof item !== 'object' || !('name' in item)) {
        continue;
      }
      const name = item.name;
      if (typeof name !== 'string') {
        continue;
      }
      const description =
        'description' in item && typeof item.description === 'string'
          ? item.description
          : undefined;
      let inputSchema: McpToolDescriptor['inputSchema'];
      if (
        'inputSchema' in item &&
        item.inputSchema &&
        typeof item.inputSchema === 'object'
      ) {
        const schema = item.inputSchema;
        inputSchema = {
          type:
            'type' in schema && typeof schema.type === 'string'
              ? schema.type
              : undefined,
          properties:
            'properties' in schema &&
            schema.properties &&
            typeof schema.properties === 'object'
              ? Object.fromEntries(Object.entries(schema.properties))
              : undefined,
          required:
            'required' in schema && Array.isArray(schema.required)
              ? schema.required.filter(
                  (r: unknown): r is string => typeof r === 'string'
                )
              : undefined,
        };
      }
      out.push({ name, description, inputSchema });
    }
    return out;
  }

  async callTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<McpCallResult> {
    this.requireTransport();
    const result: unknown = await this.transport!.request('tools/call', {
      name,
      arguments: args,
    });
    if (!result || typeof result !== 'object') {
      return { content: [], isError: true };
    }
    let content: McpCallResult['content'];
    if ('content' in result && Array.isArray(result.content)) {
      content = [];
      for (const entry of result.content) {
        if (!entry || typeof entry !== 'object') {
          continue;
        }
        content.push({
          type:
            'type' in entry && typeof entry.type === 'string'
              ? entry.type
              : undefined,
          text:
            'text' in entry && typeof entry.text === 'string'
              ? entry.text
              : undefined,
        });
      }
    }
    const isError =
      'isError' in result && typeof result.isError === 'boolean'
        ? result.isError
        : undefined;
    const structuredContent =
      'structuredContent' in result ? result.structuredContent : undefined;
    return { content, isError, structuredContent };
  }

  async close(): Promise<void> {
    this.connected = false;
    if (this.transport) {
      await this.transport.close();
      this.transport = null;
    }
  }

  toToolDefinition(tool: McpToolDescriptor): ToolDefinition {
    const properties = tool.inputSchema?.properties ?? {};
    return {
      name: tool.name,
      description: tool.description ?? tool.name,
      parameters: {
        type: tool.inputSchema?.type ?? 'object',
        properties,
        ...(tool.inputSchema?.required
          ? { required: tool.inputSchema.required }
          : {}),
      },
      requiresApproval: true,
      risk: 'high',
    };
  }

  private requireTransport(): void {
    if (!this.transport || !this.connected) {
      throw new Error(`MCP session ${this.serverId} is not connected`);
    }
  }
}

/** Flatten MCP call result into a JSON-serializable value for the agent. */
export function flattenMcpResult(result: McpCallResult): unknown {
  if (result.structuredContent !== undefined) {
    return result.structuredContent;
  }
  const texts = (result.content ?? [])
    .filter((c) => typeof c.text === 'string')
    .map((c) => c.text!);
  if (texts.length === 1) {
    return { text: texts[0], isError: result.isError ?? false };
  }
  return { content: result.content ?? [], isError: result.isError ?? false };
}
