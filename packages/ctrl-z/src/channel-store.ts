import type { Database } from 'bun:sqlite';
import {
  channelConfigSchema,
  channelIdentitySchema,
  channelMessageSchema,
  channelPublicSchema,
  outboxJobSchema,
  type ChannelConfig,
  type ChannelIdentity,
  type ChannelKind,
  type ChannelMessage,
  type ChannelPublic,
  type ChannelStatus,
  type CreateChannelInput,
  type OutboxJob,
  type OutboxStatus,
  type UpsertIdentityInput,
} from '@involvex/ctrl-s';

function id(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`;
}

type ChannelRow = {
  id: string;
  workspace_id: string;
  kind: string;
  name: string;
  config_json: string;
  status: string;
  last_error: string | null;
  created_at: number;
  updated_at: number;
};

type IdentityRow = {
  id: string;
  channel_id: string;
  workspace_id: string;
  external_user_id: string;
  display_name: string | null;
  local_user_id: string | null;
  created_at: number;
  updated_at: number;
};

type MessageRow = {
  id: string;
  channel_id: string;
  direction: string;
  external_user_id: string;
  text: string;
  conversation_id: string | null;
  created_at: number;
};

type OutboxRow = {
  id: string;
  channel_id: string;
  external_user_id: string;
  text: string;
  status: string;
  attempts: number;
  next_attempt_at: number;
  last_error: string | null;
  created_at: number;
  updated_at: number;
};

function parseConfig(raw: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(raw);
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  } catch {
    // fall through
  }
  return {};
}

function mapChannel(row: ChannelRow): ChannelConfig {
  return channelConfigSchema.parse({
    id: row.id,
    workspaceId: row.workspace_id,
    kind: row.kind,
    name: row.name,
    config: parseConfig(row.config_json),
    status: row.status,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function mapPublic(row: ChannelRow): ChannelPublic {
  return channelPublicSchema.parse({
    id: row.id,
    workspaceId: row.workspace_id,
    kind: row.kind,
    name: row.name,
    status: row.status,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function mapIdentity(row: IdentityRow): ChannelIdentity {
  return channelIdentitySchema.parse({
    id: row.id,
    channelId: row.channel_id,
    workspaceId: row.workspace_id,
    externalUserId: row.external_user_id,
    displayName: row.display_name,
    localUserId: row.local_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function mapMessage(row: MessageRow): ChannelMessage {
  return channelMessageSchema.parse({
    id: row.id,
    channelId: row.channel_id,
    direction: row.direction,
    externalUserId: row.external_user_id,
    text: row.text,
    conversationId: row.conversation_id,
    createdAt: row.created_at,
  });
}

function mapOutbox(row: OutboxRow): OutboxJob {
  return outboxJobSchema.parse({
    id: row.id,
    channelId: row.channel_id,
    externalUserId: row.external_user_id,
    text: row.text,
    status: row.status,
    attempts: row.attempts,
    nextAttemptAt: row.next_attempt_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export class ChannelStore {
  constructor(private readonly db: Database) {}

  createChannel(workspaceId: string, input: CreateChannelInput): ChannelConfig {
    const now = Date.now();
    const channelId = id('ch');
    const config = input.config ?? {};
    this.db
      .query(
        `INSERT INTO channels(
          id, workspace_id, kind, name, config_json, status, last_error, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'stopped', NULL, ?, ?)`
      )
      .run(
        channelId,
        workspaceId,
        input.kind,
        input.name,
        JSON.stringify(config),
        now,
        now
      );
    return this.getChannel(channelId)!;
  }

  listChannels(workspaceId: string): ChannelPublic[] {
    const rows = this.db
      .query<ChannelRow, [string]>(
        `SELECT * FROM channels WHERE workspace_id = ? ORDER BY created_at DESC`
      )
      .all(workspaceId);
    return rows.map(mapPublic);
  }

  getChannel(channelId: string): ChannelConfig | null {
    const row = this.db
      .query<ChannelRow, [string]>('SELECT * FROM channels WHERE id = ?')
      .get(channelId);
    return row ? mapChannel(row) : null;
  }

  getChannelPublic(channelId: string): ChannelPublic | null {
    const row = this.db
      .query<ChannelRow, [string]>('SELECT * FROM channels WHERE id = ?')
      .get(channelId);
    return row ? mapPublic(row) : null;
  }

  setStatus(
    channelId: string,
    status: ChannelStatus,
    lastError: string | null = null
  ): void {
    this.db
      .query(
        `UPDATE channels SET status = ?, last_error = ?, updated_at = ? WHERE id = ?`
      )
      .run(status, lastError, Date.now(), channelId);
  }

  upsertIdentity(
    channelId: string,
    workspaceId: string,
    input: UpsertIdentityInput
  ): ChannelIdentity {
    const existing = this.db
      .query<IdentityRow, [string, string]>(
        `SELECT * FROM channel_identities
         WHERE channel_id = ? AND external_user_id = ?`
      )
      .get(channelId, input.externalUserId);

    const now = Date.now();
    if (existing) {
      this.db
        .query(
          `UPDATE channel_identities
           SET display_name = COALESCE(?, display_name),
               local_user_id = COALESCE(?, local_user_id),
               updated_at = ?
           WHERE id = ?`
        )
        .run(
          input.displayName ?? null,
          input.localUserId ?? null,
          now,
          existing.id
        );
      return this.getIdentity(existing.id)!;
    }

    const identityId = id('cid');
    this.db
      .query(
        `INSERT INTO channel_identities(
          id, channel_id, workspace_id, external_user_id, display_name, local_user_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        identityId,
        channelId,
        workspaceId,
        input.externalUserId,
        input.displayName ?? null,
        input.localUserId ?? null,
        now,
        now
      );
    return this.getIdentity(identityId)!;
  }

  getIdentity(identityId: string): ChannelIdentity | null {
    const row = this.db
      .query<IdentityRow, [string]>(
        'SELECT * FROM channel_identities WHERE id = ?'
      )
      .get(identityId);
    return row ? mapIdentity(row) : null;
  }

  listIdentities(channelId: string): ChannelIdentity[] {
    const rows = this.db
      .query<IdentityRow, [string]>(
        `SELECT * FROM channel_identities WHERE channel_id = ? ORDER BY updated_at DESC`
      )
      .all(channelId);
    return rows.map(mapIdentity);
  }

  recordMessage(input: {
    channelId: string;
    direction: 'inbound' | 'outbound';
    externalUserId: string;
    text: string;
    conversationId?: string | null;
  }): ChannelMessage {
    const messageId = id('cmsg');
    const now = Date.now();
    this.db
      .query(
        `INSERT INTO channel_messages(
          id, channel_id, direction, external_user_id, text, conversation_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        messageId,
        input.channelId,
        input.direction,
        input.externalUserId,
        input.text,
        input.conversationId ?? null,
        now
      );
    return this.getMessage(messageId)!;
  }

  getMessage(messageId: string): ChannelMessage | null {
    const row = this.db
      .query<MessageRow, [string]>(
        'SELECT * FROM channel_messages WHERE id = ?'
      )
      .get(messageId);
    return row ? mapMessage(row) : null;
  }

  listMessages(channelId: string, limit = 50): ChannelMessage[] {
    const rows = this.db
      .query<MessageRow, [string, number]>(
        `SELECT * FROM channel_messages
         WHERE channel_id = ?
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .all(channelId, limit);
    return rows.map(mapMessage);
  }

  enqueueOutbound(
    channelId: string,
    externalUserId: string,
    text: string
  ): OutboxJob {
    const jobId = id('out');
    const now = Date.now();
    this.db
      .query(
        `INSERT INTO channel_outbox(
          id, channel_id, external_user_id, text, status, attempts, next_attempt_at, last_error, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'pending', 0, ?, NULL, ?, ?)`
      )
      .run(jobId, channelId, externalUserId, text, now, now, now);
    return this.getOutbox(jobId)!;
  }

  getOutbox(jobId: string): OutboxJob | null {
    const row = this.db
      .query<OutboxRow, [string]>('SELECT * FROM channel_outbox WHERE id = ?')
      .get(jobId);
    return row ? mapOutbox(row) : null;
  }

  listOutbox(channelId: string, limit = 50): OutboxJob[] {
    const rows = this.db
      .query<OutboxRow, [string, number]>(
        `SELECT * FROM channel_outbox
         WHERE channel_id = ?
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .all(channelId, limit);
    return rows.map(mapOutbox);
  }

  claimDueJobs(now: number, limit = 20): OutboxJob[] {
    const rows = this.db
      .query<OutboxRow, [number, number]>(
        `SELECT * FROM channel_outbox
         WHERE status IN ('pending', 'failed') AND next_attempt_at <= ?
         ORDER BY next_attempt_at ASC
         LIMIT ?`
      )
      .all(now, limit);

    for (const row of rows) {
      this.db
        .query(
          `UPDATE channel_outbox
           SET status = 'sending', attempts = attempts + 1, updated_at = ?
           WHERE id = ?`
        )
        .run(now, row.id);
    }

    return rows
      .map((row) => this.getOutbox(row.id))
      .filter((job): job is OutboxJob => job !== null);
  }

  markOutboxSent(jobId: string): void {
    this.db
      .query(
        `UPDATE channel_outbox
         SET status = 'sent', last_error = NULL, updated_at = ?
         WHERE id = ?`
      )
      .run(Date.now(), jobId);
  }

  markOutboxFailed(
    jobId: string,
    error: string,
    nextAttemptAt: number,
    status: OutboxStatus = 'failed'
  ): void {
    this.db
      .query(
        `UPDATE channel_outbox
         SET status = ?, last_error = ?, next_attempt_at = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(status, error, nextAttemptAt, Date.now(), jobId);
  }

  supportedKinds(): ChannelKind[] {
    return ['webhook', 'telegram', 'discord', 'slack'];
  }
}
