import {
  createBackup,
  listBackups,
  restoreBackup,
  setClientAuth,
  clearClientAuth,
} from '@involvex/ctrl-i';

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

function applyAuth(token: string | undefined): void {
  if (token) {
    setClientAuth({ token });
  } else {
    clearClientAuth();
  }
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

export async function backupCommand(
  baseUrl: string,
  args: string[],
  token?: string
): Promise<void> {
  applyAuth(token);
  const positionals = positionalArgs(args);
  const sub = positionals[0];
  if (!sub || sub === 'list') {
    const items = await listBackups(baseUrl);
    if (items.length === 0) {
      process.stdout.write('no backups\n');
      return;
    }
    for (const b of items) {
      process.stdout.write(
        `${b.id}  ${b.label ?? '—'}  ws=${b.workspaceCount}  enc=${b.encrypted}  ${new Date(b.createdAt).toISOString()}\n`
      );
    }
    return;
  }

  if (sub === 'create') {
    const label = flagValue(args, '--label');
    const passphrase =
      flagValue(args, '--passphrase') ?? process.env['CTRL_BACKUP_PASSPHRASE'];
    const workspaceIds = args
      .filter((_, i, arr) => arr[i - 1] === '--workspace')
      .filter((v) => !v.startsWith('-'));
    const createOpts: {
      label?: string;
      passphrase?: string;
      workspaceIds?: string[];
    } = {};
    if (label) {
      createOpts.label = label;
    }
    if (passphrase) {
      createOpts.passphrase = passphrase;
    }
    if (workspaceIds.length > 0) {
      createOpts.workspaceIds = workspaceIds;
    }
    const created = await createBackup(baseUrl, createOpts);
    process.stdout.write(
      `created ${created.id} · ${created.workspaceCount} ws · enc=${created.encrypted}\n`
    );
    return;
  }

  if (sub === 'restore') {
    const id = positionals[1];
    if (!id || id.startsWith('-')) {
      throw new Error('usage: ctrl-f5 backup restore <id> [--passphrase …]');
    }
    const passphrase =
      flagValue(args, '--passphrase') ?? process.env['CTRL_BACKUP_PASSPHRASE'];
    const restoreOpts: { passphrase?: string } = {};
    if (passphrase) {
      restoreOpts.passphrase = passphrase;
    }
    const result = await restoreBackup(baseUrl, id, restoreOpts);
    process.stdout.write(
      `restored ${result.backupId} → ${result.workspaceIds.join(', ')}\n`
    );
    return;
  }

  throw new Error(
    'usage: ctrl-f5 backup list|create|restore …\n' +
      '  create [--label name] [--passphrase secret] [--workspace id]…\n' +
      '  restore <id> [--passphrase secret]'
  );
}
