#!/usr/bin/env bun
import { checkHealth, getPairingStatus, streamDemo } from '@involvex/ctrl-i';
import {
  encodePairPayload,
  healthResponseSchema,
  pairPayloadSchema,
} from '@involvex/ctrl-s';
import { toString as qrToString } from 'qrcode';
import { listLanAddresses, pickLanUrl } from './lan';

const DEFAULT_PORT = 7331;

function usage(): never {
  process.stderr.write(`Usage:
  ctrl-f5 health [--url <baseUrl>]
  ctrl-f5 demo [--url <baseUrl>]
  ctrl-f5 pair [--host <lanIp>] [--port <port>] [--token <token>] [--url <baseUrl>]

pair   Print LAN gateway URL + terminal QR for Expo "scan pair QR".
       Prefers a real LAN IP (never 127.0.0.1). Gateway should listen on 0.0.0.0.

Env: CTRL_A_URL, CTRL_GATEWAY_TOKEN, PORT
`);
  process.exit(1);
}

function flagValue(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx === -1) {
    return undefined;
  }
  const value = args[idx + 1];
  if (!value || value.startsWith('-')) {
    usage();
  }
  return value;
}

function parseUrl(args: string[]): string {
  const fromFlag = flagValue(args, '--url');
  if (fromFlag) {
    return fromFlag;
  }
  if (process.env['CTRL_A_URL']) {
    return process.env['CTRL_A_URL'];
  }
  const port = Number(
    flagValue(args, '--port') ?? process.env['PORT'] ?? DEFAULT_PORT
  );
  const host = flagValue(args, '--host');
  return pickLanUrl(port, host);
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

async function pair(args: string[]): Promise<void> {
  const port = Number(
    flagValue(args, '--port') ?? process.env['PORT'] ?? DEFAULT_PORT
  );
  const host = flagValue(args, '--host');
  const token =
    flagValue(args, '--token') ?? process.env['CTRL_GATEWAY_TOKEN'] ?? '';
  const baseUrl = flagValue(args, '--url') ?? pickLanUrl(port, host);

  const payload = pairPayloadSchema.parse({
    v: 1,
    gatewayUrl: baseUrl,
    token,
  });
  const encoded = encodePairPayload(payload);

  process.stdout.write(`\nctrl pair\n`);
  process.stdout.write(`gateway  ${payload.gatewayUrl}\n`);
  process.stdout.write(
    `token    ${payload.token ? '(set)' : '(open — no token)'}\n`
  );
  const addrs = listLanAddresses();
  if (addrs.length > 0) {
    process.stdout.write(`lanips   ${addrs.join(' ')}\n`);
  }
  process.stdout.write(`\nScan with Expo → scan pair QR\n\n`);

  const qr = await qrToString(encoded, {
    type: 'terminal',
    small: true,
    errorCorrectionLevel: 'M',
  });
  process.stdout.write(qr);
  process.stdout.write(`\npayload  ${encoded}\n`);

  try {
    const status = await getPairingStatus(payload.gatewayUrl);
    process.stdout.write(
      `\nprobe    ok · auth ${status.required ? 'required' : 'open'}` +
        (status.urls?.length ? ` · ${status.urls.join(' ')}` : '') +
        `\n`
    );
  } catch (err) {
    process.stderr.write(
      `\nprobe    gateway not reachable at ${payload.gatewayUrl}\n` +
        `         start with: br gateway:free && br dev:gateway\n` +
        `         (${err instanceof Error ? err.message : String(err)})\n`
    );
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (cmd === 'pair') {
    await pair(args.slice(1));
    return;
  }

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
