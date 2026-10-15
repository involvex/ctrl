#!/usr/bin/env bun
import { healthResponseSchema } from '@involvex/ctrl-s';

const DEFAULT_BASE = 'http://127.0.0.1:7331';

function usage(): never {
  process.stderr.write(`Usage:
  ctrl-f5 health [--url <baseUrl>]

Default gateway: ${DEFAULT_BASE}
`);
  process.exit(1);
}

async function health(baseUrl: string): Promise<void> {
  const url = `${baseUrl.replace(/\/$/, '')}/healthz`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`healthz failed: ${res.status} ${res.statusText}`);
  }
  const body: unknown = await res.json();
  const parsed = healthResponseSchema.parse(body);
  process.stdout.write(`${JSON.stringify(parsed, null, 2)}\n`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (cmd !== 'health') {
    usage();
  }

  let baseUrl = process.env['CTRL_A_URL'] ?? DEFAULT_BASE;
  const urlIdx = args.indexOf('--url');
  if (urlIdx !== -1) {
    const value = args[urlIdx + 1];
    if (!value) {
      usage();
    }
    baseUrl = value;
  }

  await health(baseUrl);
}

await main();
