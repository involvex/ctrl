#!/usr/bin/env bun
import { checkHealth, streamDemo } from '@involvex/ctrl-i';
import { healthResponseSchema } from '@involvex/ctrl-s';

const DEFAULT_BASE = 'http://127.0.0.1:7331';

function usage(): never {
  process.stderr.write(`Usage:
  ctrl-f5 health [--url <baseUrl>]
  ctrl-f5 demo [--url <baseUrl>]

Default gateway: ${DEFAULT_BASE}
`);
  process.exit(1);
}

function parseUrl(args: string[]): string {
  let baseUrl = process.env['CTRL_A_URL'] ?? DEFAULT_BASE;
  const urlIdx = args.indexOf('--url');
  if (urlIdx !== -1) {
    const value = args[urlIdx + 1];
    if (!value) {
      usage();
    }
    baseUrl = value;
  }
  return baseUrl;
}

async function health(baseUrl: string): Promise<void> {
  const parsed = healthResponseSchema.parse(await checkHealth(baseUrl));
  process.stdout.write(`${JSON.stringify(parsed, null, 2)}\n`);
}

async function demo(baseUrl: string): Promise<void> {
  await checkHealth(baseUrl);
  await new Promise<void>((resolve, reject) => {
    let text = '';
    streamDemo(baseUrl, {
      onEvent: (event) => {
        if (event.type === 'message.delta') {
          text += event.text;
          process.stdout.write(event.text);
        }
        if (event.type === 'run.completed') {
          process.stdout.write(`\n[done] ${text.length} chars\n`);
          resolve();
        }
        if (event.type === 'run.failed') {
          reject(new Error(event.error.message));
        }
      },
      onError: reject,
    });
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const baseUrl = parseUrl(args);

  if (cmd === 'health') {
    await health(baseUrl);
    return;
  }
  if (cmd === 'demo') {
    await demo(baseUrl);
    return;
  }
  usage();
}

await main();
