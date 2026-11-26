#!/usr/bin/env bun
import { checkHealth, getPairingStatus, streamDemo } from '@involvex/ctrl-i';
import {
  encodePairPayload,
  healthResponseSchema,
  pairPayloadSchema,
} from '@involvex/ctrl-s';
import { toString as qrToString } from 'qrcode';
import { backupCommand } from './backup';
import { channelCommand } from './channel';
import { chatCommand } from './chat';
import { doctorCommand } from './doctor';
import { completionScript, parseCompletionShell } from './completion';
import {
  DEFAULT_GATEWAY_PORT,
  gatewayRestart,
  gatewayStart,
  gatewayStatus,
  gatewayStop,
} from './gateway-lifecycle';
import { knowledgeCommand } from './knowledge';
import { listLanAddresses, pickLanUrl } from './lan';

function usage(): never {
  process.stderr.write(`Usage:
  ctrl-f5 start   [--port <port>] [--host <bindHost>]
  ctrl-f5 stop    [--port <port>]
  ctrl-f5 restart [--port <port>] [--host <bindHost>]
  ctrl-f5 status  [--port <port>] [--url <baseUrl>]
  ctrl-f5 health  [--url <baseUrl>]
  ctrl-f5 doctor  [--url <baseUrl>]
  ctrl-f5 demo    [--url <baseUrl>]
  ctrl-f5 chat   [--url <baseUrl>] [--token <token>] [message...]
  ctrl-f5 backup list|create|restore […] [--url <baseUrl>] [--token <token>]
  ctrl-f5 knowledge search|reindex|status […] [--url <baseUrl>] [--token <token>]
  ctrl-f5 channel list|add|start|stop […] [--url <baseUrl>]
  ctrl-f5 pair   [--host <lanIp>] [--port <port>] [--token <token>] [--url <baseUrl>]
  ctrl-f5 completion bash|powershell

start/stop/restart/status  Manage local ctrl-a gateway (pid under data/ctrl-a.pid).
chat               One-shot or interactive TTY chat against a running gateway.
backup             Host snapshot list / create / restore (optional --passphrase).
knowledge          Search / reindex / embedding status against a running gateway.
channel            List/add/start/stop gateway channels (telegram, discord, slack, webhook).
pair               Print LAN QR; exits 0 after phone pairing ack (or Ctrl+C).
completion         Print shell tab-completion script (eval / source it).

Env: CTRL_A_URL, CTRL_A_HOST, CTRL_GATEWAY_TOKEN, CTRL_BACKUP_PASSPHRASE,
     TELEGRAM_BOT_TOKEN, DISCORD_BOT_TOKEN, SLACK_BOT_TOKEN, SLACK_APP_TOKEN,
     PORT, CTRL_DATA_DIR, CTRL_REPO_ROOT
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

function stripFlags(args: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg.startsWith('--')) {
      i += 1; // skip value
      continue;
    }
    out.push(arg);
  }
  return out;
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
    flagValue(args, '--port') ?? process.env['PORT'] ?? DEFAULT_GATEWAY_PORT
  );
  const host = flagValue(args, '--host');
  if (host) {
    return pickLanUrl(port, host);
  }
  // Prefer loopback for local client commands when no LAN host requested.
  return `http://127.0.0.1:${port}`;
}

function parsePort(args: string[]): number {
  return Number(
    flagValue(args, '--port') ?? process.env['PORT'] ?? DEFAULT_GATEWAY_PORT
  );
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
  const port = parsePort(args);
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

  // Windows terminals struggle with small QR modules — use a larger glyph grid.
  const qr = await qrToString(encoded, {
    type: 'terminal',
    small: process.platform !== 'win32',
    errorCorrectionLevel: 'M',
  });
  process.stdout.write(qr);
  process.stdout.write(`\npayload  ${encoded}\n`);
  process.stdout.write(
    `(paste that payload into mobile Connect if the QR is hard to scan)\n`
  );

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
        `         start with: ctrl-f5 start\n` +
        `         (${err instanceof Error ? err.message : String(err)})\n`
    );
  }

  const startedAt = Date.now();
  process.stdout.write(`\nWaiting for phone pairing ack — Ctrl+C to cancel.\n`);

  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = (msg: string) => {
      if (settled) {
        return;
      }
      settled = true;
      clearInterval(timer);
      process.stdout.write(`\n${msg}\n`);
      resolve();
    };
    const stop = (signal: string) => finish(`pair stopped (${signal})`);
    process.once('SIGINT', () => stop('SIGINT'));
    process.once('SIGTERM', () => stop('SIGTERM'));
    process.once('SIGBREAK', () => stop('SIGBREAK'));

    const timer = setInterval(() => {
      void (async () => {
        try {
          const status = await getPairingStatus(payload.gatewayUrl);
          const ackAt = status.lastAck?.at
            ? Date.parse(status.lastAck.at)
            : NaN;
          if (Number.isFinite(ackAt) && ackAt >= startedAt - 2_000) {
            const label = status.lastAck?.label
              ? ` · ${status.lastAck.label}`
              : '';
            finish(`paired${label}`);
          }
        } catch {
          // Gateway may restart briefly; keep polling.
        }
      })();
    }, 1_000);
  });
}

async function cmdStart(args: string[]): Promise<void> {
  const port = parsePort(args);
  const host =
    flagValue(args, '--host') ?? process.env['CTRL_A_HOST'] ?? '0.0.0.0';
  const result = await gatewayStart({ port, host });
  process.stdout.write(
    result.alreadyRunning
      ? `already running · ${result.meta.url} · pid ${result.meta.pid || '—'}\n`
      : `started · ${result.meta.url} · pid ${result.meta.pid}\n`
  );
}

async function cmdStop(args: string[]): Promise<void> {
  const port = parsePort(args);
  const result = await gatewayStop({ port });
  process.stdout.write(`${result.message}\n`);
}

async function cmdRestart(args: string[]): Promise<void> {
  const portFlag = flagValue(args, '--port');
  const hostFlag = flagValue(args, '--host');
  const opts: { port?: number; host?: string } = {};
  if (portFlag) {
    opts.port = Number(portFlag);
  }
  if (hostFlag) {
    opts.host = hostFlag;
  } else if (process.env['CTRL_A_HOST']) {
    opts.host = process.env['CTRL_A_HOST'];
  }
  const result = await gatewayRestart(opts);
  process.stdout.write(`${result.stop.message}\n`);
  process.stdout.write(
    result.start.alreadyRunning
      ? `already running · ${result.start.meta.url} · pid ${result.start.meta.pid || '—'}\n`
      : `restarted · ${result.start.meta.url} · pid ${result.start.meta.pid}\n`
  );
}

async function cmdStatus(args: string[]): Promise<void> {
  const port = parsePort(args);
  const host = flagValue(args, '--host');
  const urlFlag = flagValue(args, '--url');
  if (urlFlag) {
    try {
      const parsed = healthResponseSchema.parse(await checkHealth(urlFlag));
      process.stdout.write(
        `running · ${urlFlag} · ${parsed.service} ${parsed.version}\n`
      );
    } catch (err) {
      process.stdout.write(
        `stopped · ${urlFlag} · ${err instanceof Error ? err.message : String(err)}\n`
      );
      process.exitCode = 1;
    }
    return;
  }
  const status = await gatewayStatus({ port, host });
  process.stdout.write(`${status.state} · ${status.message}\n`);
  if (status.state !== 'running') {
    process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const rest = args.slice(1);

  if (!cmd) {
    usage();
  }

  if (cmd === 'start') {
    await cmdStart(rest);
    return;
  }
  if (cmd === 'stop') {
    await cmdStop(rest);
    return;
  }
  if (cmd === 'restart') {
    try {
      await cmdRestart(rest);
    } catch (err) {
      process.stderr.write(
        `${err instanceof Error ? err.message : String(err)}\n`
      );
      process.exit(1);
    }
    return;
  }
  if (cmd === 'status') {
    await cmdStatus(rest);
    return;
  }
  if (cmd === 'pair') {
    await pair(rest);
    return;
  }
  if (cmd === 'chat') {
    const baseUrl = parseUrl(rest);
    const token =
      flagValue(rest, '--token') ?? process.env['CTRL_GATEWAY_TOKEN'];
    await chatCommand(baseUrl, stripFlags(rest), token);
    return;
  }
  if (cmd === 'backup') {
    const baseUrl = parseUrl(rest);
    const token =
      flagValue(rest, '--token') ?? process.env['CTRL_GATEWAY_TOKEN'];
    try {
      // Keep --label / --passphrase / --workspace for backupCommand.
      await backupCommand(baseUrl, rest, token);
    } catch (err) {
      process.stderr.write(
        `${err instanceof Error ? err.message : String(err)}\n`
      );
      process.exit(1);
    }
    return;
  }
  if (cmd === 'knowledge') {
    const baseUrl = parseUrl(rest);
    const token =
      flagValue(rest, '--token') ?? process.env['CTRL_GATEWAY_TOKEN'];
    try {
      await knowledgeCommand(baseUrl, rest, token);
    } catch (err) {
      process.stderr.write(
        `${err instanceof Error ? err.message : String(err)}\n`
      );
      process.exit(1);
    }
    return;
  }
  if (cmd === 'channel') {
    const baseUrl = parseUrl(rest);
    try {
      await channelCommand(baseUrl, rest);
    } catch (err) {
      process.stderr.write(
        `${err instanceof Error ? err.message : String(err)}\n`
      );
      process.exit(1);
    }
    return;
  }
  if (cmd === 'completion') {
    try {
      const shell = parseCompletionShell(rest[0]);
      process.stdout.write(completionScript(shell));
    } catch (err) {
      process.stderr.write(
        `${err instanceof Error ? err.message : String(err)}\n`
      );
      process.exit(1);
    }
    return;
  }

  const baseUrl = parseUrl(rest);
  if (cmd === 'health') {
    await health(baseUrl);
    return;
  }
  if (cmd === 'doctor') {
    await doctorCommand(rest);
    return;
  }
  if (cmd === 'demo') {
    await demo(baseUrl);
    return;
  }
  usage();
}

await main();
