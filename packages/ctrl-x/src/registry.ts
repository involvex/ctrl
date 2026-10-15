import {
  toolDefinitionSchema,
  type ToolCall,
  type ToolDefinition,
} from '@involvex/ctrl-s';

export type ToolContext = {
  signal?: AbortSignal;
  sandboxRoot: string;
};

export type ToolHandler = (
  call: ToolCall,
  ctx: ToolContext
) => Promise<unknown>;

export type RegisteredTool = {
  definition: ToolDefinition;
  execute: ToolHandler;
};

export class ToolRegistry {
  private readonly tools = new Map<string, RegisteredTool>();

  register(definition: ToolDefinition, execute: ToolHandler): void {
    const def = toolDefinitionSchema.parse(definition);
    this.tools.set(def.name, { definition: def, execute });
  }

  get(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  list(): ToolDefinition[] {
    return [...this.tools.values()].map((t) => t.definition);
  }

  listNames(): string[] {
    return [...this.tools.keys()];
  }
}
