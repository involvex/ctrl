import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  mcpServerConfigSchema,
  persistedMcpFileSchema,
  type McpServerConfig,
  type PersistedMcpFile,
} from '@involvex/ctrl-s';

export function mcpPersistPath(dataDir: string): string {
  return path.join(dataDir, 'mcp.json');
}

export function loadPersistedMcp(filePath: string): McpServerConfig[] | null {
  try {
    const raw = readFileSync(filePath, 'utf8');
    const parsed = persistedMcpFileSchema.parse(JSON.parse(raw) as unknown);
    return parsed.servers.map((s) => mcpServerConfigSchema.parse(s));
  } catch {
    return null;
  }
}

export function savePersistedMcp(
  filePath: string,
  servers: McpServerConfig[]
): void {
  const payload: PersistedMcpFile = {
    version: 1,
    servers: servers.map((s) => mcpServerConfigSchema.parse(s)),
  };
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

/** Parse CTRL_MCP_SERVERS JSON env into server configs (empty if unset/invalid). */
export function parseMcpServersEnv(
  raw: string | undefined
): McpServerConfig[] | null {
  const text = raw?.trim();
  if (!text) {
    return null;
  }
  const parsed: unknown = JSON.parse(text);
  if (!Array.isArray(parsed)) {
    throw new Error('CTRL_MCP_SERVERS must be a JSON array');
  }
  const servers: McpServerConfig[] = [];
  for (const item of parsed) {
    const result = mcpServerConfigSchema.safeParse(item);
    if (result.success) {
      servers.push(result.data);
    }
  }
  return servers;
}
