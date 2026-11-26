import {
  clearClientAuth,
  createWorkspace,
  getEmbeddingStatus,
  listWorkspaces,
  reindexKnowledge,
  searchKnowledge,
  setClientAuth,
} from '@involvex/ctrl-i';
import type { KnowledgeSearchMode } from '@involvex/ctrl-s';

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

const VALUELESS_FLAGS = new Set(['--force']);

function positionalArgs(args: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg.startsWith('--')) {
      if (!VALUELESS_FLAGS.has(arg)) {
        i += 1;
      }
      continue;
    }
    out.push(arg);
  }
  return out;
}

function applyAuth(token: string | undefined): void {
  if (token) {
    setClientAuth({ token });
  } else {
    clearClientAuth();
  }
}

function knowledgeUsage(): never {
  throw new Error(
    'usage: ctrl-f5 knowledge search <query> [--mode fts|vector|hybrid] [--limit n] [--workspace id]\n' +
      '       ctrl-f5 knowledge reindex [--force] [--limit n] [--workspace id]\n' +
      '       ctrl-f5 knowledge status [--workspace id]'
  );
}

async function resolveWorkspaceId(
  baseUrl: string,
  args: string[]
): Promise<string> {
  const fromFlag = flagValue(args, '--workspace');
  if (fromFlag) {
    return fromFlag;
  }
  const workspaces = await listWorkspaces(baseUrl);
  const workspace = workspaces[0] ?? (await createWorkspace(baseUrl, 'CLI'));
  return workspace.id;
}

function parseMode(raw: string | undefined): KnowledgeSearchMode | undefined {
  if (!raw) {
    return undefined;
  }
  if (raw === 'fts' || raw === 'vector' || raw === 'hybrid') {
    return raw;
  }
  throw new Error(`invalid --mode ${raw} (expected fts|vector|hybrid)`);
}

export async function knowledgeCommand(
  baseUrl: string,
  args: string[],
  token?: string
): Promise<void> {
  applyAuth(token);
  const positionals = positionalArgs(args);
  const sub = positionals[0];

  if (sub === 'search') {
    const query = positionals.slice(1).join(' ').trim();
    if (!query) {
      knowledgeUsage();
    }
    const workspaceId = await resolveWorkspaceId(baseUrl, args);
    const mode = parseMode(flagValue(args, '--mode'));
    const limitRaw = flagValue(args, '--limit');
    const limit = limitRaw ? Number(limitRaw) : undefined;
    if (limitRaw && (!Number.isFinite(limit) || (limit ?? 0) <= 0)) {
      throw new Error(`invalid --limit ${limitRaw}`);
    }
    const hits = await searchKnowledge(
      baseUrl,
      workspaceId,
      query,
      limit,
      mode
    );
    if (hits.length === 0) {
      process.stdout.write('no hits\n');
      return;
    }
    for (const hit of hits) {
      const score =
        hit.score !== undefined ? ` score=${hit.score.toFixed(4)}` : '';
      const source = hit.source ? ` ${hit.source}` : '';
      const snippet = hit.snippet.replace(/\s+/g, ' ').slice(0, 160);
      process.stdout.write(
        `${hit.filename}  rank=${hit.rank}${score}${source}\n  ${snippet}\n`
      );
    }
    return;
  }

  if (sub === 'reindex') {
    const workspaceId = await resolveWorkspaceId(baseUrl, args);
    const force = args.includes('--force');
    const limitRaw = flagValue(args, '--limit');
    const limit = limitRaw ? Number(limitRaw) : undefined;
    if (limitRaw && (!Number.isFinite(limit) || (limit ?? 0) <= 0)) {
      throw new Error(`invalid --limit ${limitRaw}`);
    }
    const opts: { force?: boolean; limit?: number } = {};
    if (force) {
      opts.force = true;
    }
    if (limit !== undefined) {
      opts.limit = limit;
    }
    const result = await reindexKnowledge(baseUrl, workspaceId, opts);
    process.stdout.write(
      `reindex ${result.workspaceId}  model=${result.model}  indexed=${result.indexed}  skipped=${result.skipped}  chunks=${result.indexedChunks}/${result.totalChunks}\n`
    );
    return;
  }

  if (sub === 'status') {
    const workspaceId = flagValue(args, '--workspace');
    const status = await getEmbeddingStatus(baseUrl, workspaceId);
    const hint = status.hint ? `  hint=${status.hint}` : '';
    process.stdout.write(
      `embeddings  provider=${status.provider}  model=${status.model}  dims=${status.dims}  enabled=${status.enabled}  chunks=${status.indexedChunks}/${status.totalChunks}${hint}\n`
    );
    return;
  }

  knowledgeUsage();
}
