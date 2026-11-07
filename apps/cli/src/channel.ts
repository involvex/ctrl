import {
  createChannel,
  createWorkspace,
  deleteChannel,
  listChannels,
  listWorkspaces,
  setClientAuth,
  clearClientAuth,
  startChannel,
  stopChannel,
} from '@involvex/ctrl-i';
import type { ChannelKind } from '@involvex/ctrl-s';

function flagValue(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx === -1) {
    return undefined;
  }
  const value = args[idx + 1];
  if (!value || value.startsWith('-')) {
    throw new Error(`missing value for ${name}`);
  }
  return value;
}

function positionalArgs(args: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg.startsWith('--')) {
      i += 1;
      continue;
    }
    out.push(arg);
  }
  return out;
}

function channelUsage(): never {
  process.stderr.write(`Usage:
  ctrl-f5 channel list [--url <baseUrl>] [--token <gatewayToken>]
  ctrl-f5 channel add telegram --token <botToken> [--name <name>] [--url]
  ctrl-f5 channel add webhook [--name <name>] [--url]
  ctrl-f5 channel start <channelId> [--url] [--token <gatewayToken>]
  ctrl-f5 channel stop <channelId> [--url] [--token <gatewayToken>]
  ctrl-f5 channel remove <channelId> [--url] [--token <gatewayToken>]

Env: TELEGRAM_BOT_TOKEN (when --token omitted for telegram add),
     CTRL_GATEWAY_TOKEN (gateway auth; preferred over --token for telegram add),
     CTRL_A_URL
`);
  process.exit(1);
}

async function ensureWorkspace(baseUrl: string): Promise<string> {
  const workspaces = await listWorkspaces(baseUrl);
  const workspace = workspaces[0] ?? (await createWorkspace(baseUrl, 'CLI'));
  return workspace.id;
}

function applyGatewayAuth(args: string[], isTelegramAdd: boolean): void {
  const fromEnv = process.env['CTRL_GATEWAY_TOKEN'];
  if (fromEnv) {
    setClientAuth({ token: fromEnv });
    return;
  }
  if (isTelegramAdd) {
    // --token is the bot token; no gateway token available.
    clearClientAuth();
    return;
  }
  const fromFlag = flagValue(args, '--token');
  if (fromFlag) {
    setClientAuth({ token: fromFlag });
  } else {
    clearClientAuth();
  }
}

export async function channelCommand(
  baseUrl: string,
  args: string[]
): Promise<void> {
  const positionals = positionalArgs(args);
  const sub = positionals[0];
  const isTelegramAdd = sub === 'add' && positionals[1] === 'telegram';
  applyGatewayAuth(args, isTelegramAdd);

  if (!sub || sub === 'list') {
    const workspaceId = await ensureWorkspace(baseUrl);
    const items = await listChannels(baseUrl, workspaceId);
    if (items.length === 0) {
      process.stdout.write('no channels\n');
      return;
    }
    for (const ch of items) {
      const err = ch.lastError ? ` · ${ch.lastError}` : '';
      process.stdout.write(
        `${ch.id}  ${ch.kind}  ${ch.name}  ${ch.status}${err}\n`
      );
    }
    return;
  }

  if (sub === 'add') {
    const kindRaw = positionals[1];
    if (kindRaw !== 'telegram' && kindRaw !== 'webhook') {
      channelUsage();
    }
    const kind: ChannelKind = kindRaw;
    const name =
      flagValue(args, '--name') ??
      (kind === 'telegram' ? 'telegram' : 'webhook');

    if (kind === 'telegram') {
      const botToken =
        flagValue(args, '--token') ?? process.env['TELEGRAM_BOT_TOKEN'];
      if (!botToken) {
        throw new Error(
          'telegram bot token required (--token or TELEGRAM_BOT_TOKEN)'
        );
      }
      const workspaceId = await ensureWorkspace(baseUrl);
      const created = await createChannel(baseUrl, workspaceId, {
        kind: 'telegram',
        name,
        config: { botToken },
      });
      process.stdout.write(
        `created ${created.id}  ${created.kind}  ${created.name}  ${created.status}\n`
      );
      return;
    }

    const workspaceId = await ensureWorkspace(baseUrl);
    const created = await createChannel(baseUrl, workspaceId, {
      kind: 'webhook',
      name,
    });
    process.stdout.write(
      `created ${created.id}  ${created.kind}  ${created.name}  ${created.status}\n`
    );
    return;
  }

  if (sub === 'start' || sub === 'stop') {
    const channelId = positionals[1];
    if (!channelId) {
      channelUsage();
    }
    const result =
      sub === 'start'
        ? await startChannel(baseUrl, channelId)
        : await stopChannel(baseUrl, channelId);
    process.stdout.write(
      `${sub} ${result.id}  ${result.kind}  ${result.name}  ${result.status}\n`
    );
    return;
  }

  if (sub === 'remove' || sub === 'rm' || sub === 'delete') {
    const channelId = positionals[1];
    if (!channelId) {
      channelUsage();
    }
    await deleteChannel(baseUrl, channelId);
    process.stdout.write(`removed ${channelId}\n`);
    return;
  }

  channelUsage();
}
