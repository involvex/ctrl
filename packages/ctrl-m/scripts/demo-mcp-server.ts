#!/usr/bin/env bun
/**
 * Minimal MCP stdio server for contract tests and local demos.
 * Speaks newline-delimited JSON-RPC on stdin/stdout (MCP 2024-11-05).
 */
import { createInterface } from 'node:readline';

type JsonRpcMessage = {
  jsonrpc?: string;
  id?: number | string | null;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: unknown;
};

function respond(
  id: number | string | null | undefined,
  result: unknown
): void {
  if (id === undefined || id === null) {
    return;
  }
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`);
}

function fail(
  id: number | string | null | undefined,
  code: number,
  message: string
): void {
  if (id === undefined || id === null) {
    return;
  }
  process.stdout.write(
    `${JSON.stringify({
      jsonrpc: '2.0',
      id,
      error: { code, message },
    })}\n`
  );
}

let initialized = false;

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });

rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) {
    return;
  }
  let msg: JsonRpcMessage;
  try {
    msg = JSON.parse(trimmed) as JsonRpcMessage;
  } catch {
    return;
  }

  const method = msg.method;
  if (!method) {
    return;
  }

  if (method === 'initialize') {
    respond(msg.id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'ctrl-demo-mcp', version: '0.0.1' },
    });
    return;
  }

  if (method === 'notifications/initialized') {
    initialized = true;
    return;
  }

  if (!initialized && method !== 'ping') {
    fail(msg.id, -32002, 'not initialized');
    return;
  }

  if (method === 'ping') {
    respond(msg.id, {});
    return;
  }

  if (method === 'tools/list') {
    respond(msg.id, {
      tools: [
        {
          name: 'echo',
          description: 'Echo a string via stdio MCP demo server',
          inputSchema: {
            type: 'object',
            properties: { text: { type: 'string' } },
            required: ['text'],
          },
        },
      ],
    });
    return;
  }

  if (method === 'tools/call') {
    const params = msg.params;
    let toolName = '';
    const toolArgs: Record<string, unknown> = {};
    if (params && typeof params === 'object' && 'name' in params) {
      if (typeof params.name === 'string') {
        toolName = params.name;
      }
      if (
        'arguments' in params &&
        params.arguments &&
        typeof params.arguments === 'object' &&
        !Array.isArray(params.arguments)
      ) {
        for (const [k, v] of Object.entries(params.arguments)) {
          toolArgs[k] = v;
        }
      }
    }
    if (toolName !== 'echo') {
      fail(msg.id, -32601, `unknown tool: ${toolName}`);
      return;
    }
    const textValue = toolArgs['text'];
    const text = typeof textValue === 'string' ? textValue : '';
    respond(msg.id, {
      content: [{ type: 'text', text }],
      structuredContent: { echo: text },
    });
    return;
  }

  fail(msg.id, -32601, `method not found: ${method}`);
});
