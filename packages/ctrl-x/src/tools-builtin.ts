import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { Sandbox, parseShellCommand } from './sandbox';
import type { ToolRegistry } from './registry';

const shellArgsSchema = z.object({
  command: z.string().min(1).max(500),
});

const fsReadArgsSchema = z.object({
  path: z.string().min(1).max(500),
});

const fsWriteArgsSchema = z.object({
  path: z.string().min(1).max(500),
  content: z.string().max(100_000),
});

const fsListArgsSchema = z.object({
  path: z.string().default('.'),
});

export function registerBuiltinTools(
  registry: ToolRegistry,
  sandboxRoot: string
): void {
  const sandbox = new Sandbox(sandboxRoot);

  registry.register(
    {
      name: 'shell',
      description:
        'Run an allowlisted command inside the sandbox working directory',
      parameters: {
        type: 'object',
        properties: { command: { type: 'string' } },
        required: ['command'],
      },
      requiresApproval: true,
      risk: 'high',
    },
    async (call, ctx) => {
      const { command } = shellArgsSchema.parse(call.arguments);
      const { bin, args } = parseShellCommand(command);
      // Windows builtins (echo/dir/type) need cmd.exe; Unix runs the binary directly.
      const argv =
        process.platform === 'win32'
          ? ['cmd.exe', '/d', '/s', '/c', bin, ...args]
          : [bin, ...args];
      const proc = Bun.spawn(argv, {
        cwd: sandbox.root,
        stdout: 'pipe',
        stderr: 'pipe',
        signal: ctx.signal,
      });
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);
      return {
        exitCode,
        stdout: stdout.slice(0, 20_000),
        stderr: stderr.slice(0, 5_000),
      };
    }
  );

  registry.register(
    {
      name: 'fs_read',
      description: 'Read a UTF-8 text file inside the sandbox',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
      requiresApproval: false,
      risk: 'low',
    },
    async (call) => {
      const { path: userPath } = fsReadArgsSchema.parse(call.arguments);
      const target = sandbox.resolve(userPath);
      const content = await readFile(target, 'utf8');
      return { path: path.relative(sandbox.root, target), content };
    }
  );

  registry.register(
    {
      name: 'fs_write',
      description: 'Write a UTF-8 text file inside the sandbox',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string' },
        },
        required: ['path', 'content'],
      },
      requiresApproval: true,
      risk: 'high',
    },
    async (call) => {
      const { path: userPath, content } = fsWriteArgsSchema.parse(
        call.arguments
      );
      const target = sandbox.resolve(userPath);
      await writeFile(target, content, 'utf8');
      return {
        path: path.relative(sandbox.root, target),
        bytes: content.length,
      };
    }
  );

  registry.register(
    {
      name: 'fs_list',
      description: 'List files in a sandbox directory',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' } },
      },
      requiresApproval: false,
      risk: 'low',
    },
    async (call) => {
      const { path: userPath } = fsListArgsSchema.parse(call.arguments ?? {});
      const target = sandbox.resolve(userPath);
      const entries = await readdir(target);
      const items = await Promise.all(
        entries.map(async (name) => {
          const full = path.join(target, name);
          const info = await stat(full);
          return {
            name,
            type: info.isDirectory() ? 'dir' : 'file',
            size: info.size,
          };
        })
      );
      return { path: path.relative(sandbox.root, target) || '.', items };
    }
  );
}
