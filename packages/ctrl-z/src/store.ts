import type { Database } from 'bun:sqlite';
import {
  agentProfileSchema,
  auditEntrySchema,
  messageRoleSchema,
  workspaceExportSchema,
  type AgentProfile,
  type AuditAction,
  type AuditEntry,
  type Conversation,
  type Message,
  type MessageRole,
  type Workspace,
  type WorkspaceExport,
} from '@involvex/ctrl-s';

function id(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`;
}

function parseStringArray(raw: string): string[] {
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.filter((item): item is string => typeof item === 'string');
}

type WorkspaceRow = {
  id: string;
  name: string;
  created_at: number;
  updated_at: number;
};

type ConversationRow = {
  id: string;
  workspace_id: string;
  title: string;
  created_at: number;
  updated_at: number;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  created_at: number;
};

function mapWorkspace(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMessage(row: MessageRow): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: messageRoleSchema.parse(row.role),

    content: row.content,
    createdAt: row.created_at,
  };
}

export class Store {
  constructor(private readonly db: Database) {}

  listWorkspaces(): Workspace[] {
    const rows = this.db
      .query<WorkspaceRow, []>(
        'SELECT id, name, created_at, updated_at FROM workspaces ORDER BY created_at DESC'
      )
      .all();
    return rows.map(mapWorkspace);
  }

  createWorkspace(name: string): Workspace {
    const now = Date.now();
    const workspace: Workspace = {
      id: id('ws'),
      name,
      createdAt: now,
      updatedAt: now,
    };
    this.db
      .query(
        'INSERT INTO workspaces(id, name, created_at, updated_at) VALUES (?, ?, ?, ?)'
      )
      .run(
        workspace.id,
        workspace.name,
        workspace.createdAt,
        workspace.updatedAt
      );
    return workspace;
  }

  getWorkspace(workspaceId: string): Workspace | null {
    const row = this.db
      .query<WorkspaceRow, [string]>(
        'SELECT id, name, created_at, updated_at FROM workspaces WHERE id = ?'
      )
      .get(workspaceId);
    return row ? mapWorkspace(row) : null;
  }

  listConversations(workspaceId: string): Conversation[] {
    const rows = this.db
      .query<ConversationRow, [string]>(
        `SELECT id, workspace_id, title, created_at, updated_at
         FROM conversations WHERE workspace_id = ? ORDER BY updated_at DESC`
      )
      .all(workspaceId);
    return rows.map(mapConversation);
  }

  createConversation(workspaceId: string, title: string): Conversation {
    const ws = this.getWorkspace(workspaceId);
    if (!ws) {
      throw new Error('workspace not found');
    }
    const now = Date.now();
    const conversation: Conversation = {
      id: id('cv'),
      workspaceId,
      title,
      createdAt: now,
      updatedAt: now,
    };
    this.db
      .query(
        `INSERT INTO conversations(id, workspace_id, title, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(
        conversation.id,
        conversation.workspaceId,
        conversation.title,
        conversation.createdAt,
        conversation.updatedAt
      );
    return conversation;
  }

  getConversation(conversationId: string): Conversation | null {
    const row = this.db
      .query<ConversationRow, [string]>(
        `SELECT id, workspace_id, title, created_at, updated_at
         FROM conversations WHERE id = ?`
      )
      .get(conversationId);
    return row ? mapConversation(row) : null;
  }

  listMessages(conversationId: string): Message[] {
    const rows = this.db
      .query<MessageRow, [string]>(
        `SELECT id, conversation_id, role, content, created_at
         FROM messages WHERE conversation_id = ? ORDER BY created_at ASC`
      )
      .all(conversationId);
    return rows.map(mapMessage);
  }

  addMessage(
    conversationId: string,
    role: MessageRole,
    content: string
  ): Message {
    const conversation = this.getConversation(conversationId);
    if (!conversation) {
      throw new Error('conversation not found');
    }
    const now = Date.now();
    const message: Message = {
      id: id('msg'),
      conversationId,
      role,
      content,
      createdAt: now,
    };
    this.db
      .query(
        `INSERT INTO messages(id, conversation_id, role, content, created_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(
        message.id,
        message.conversationId,
        message.role,
        message.content,
        message.createdAt
      );
    this.db
      .query('UPDATE conversations SET updated_at = ? WHERE id = ?')
      .run(now, conversationId);
    return message;
  }

  /**
   * Append-only upsert for device sync. Existing ids are left unchanged.
   */
  upsertMessage(message: Message): Message {
    const conversation = this.getConversation(message.conversationId);
    if (!conversation) {
      throw new Error('conversation not found');
    }
    const existing = this.listMessages(message.conversationId).find(
      (m) => m.id === message.id
    );
    if (existing) {
      return existing;
    }
    this.db
      .query(
        `INSERT INTO messages(id, conversation_id, role, content, created_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(
        message.id,
        message.conversationId,
        message.role,
        message.content,
        message.createdAt
      );
    this.db
      .query('UPDATE conversations SET updated_at = ? WHERE id = ?')
      .run(Date.now(), message.conversationId);
    return message;
  }

  exportWorkspace(workspaceId: string): WorkspaceExport {
    const workspace = this.getWorkspace(workspaceId);
    if (!workspace) {
      throw new Error('workspace not found');
    }
    const conversations = this.listConversations(workspaceId).map(
      (conversation) => ({
        conversation,
        messages: this.listMessages(conversation.id),
      })
    );
    return workspaceExportSchema.parse({
      version: 1,
      exportedAt: Date.now(),
      workspace,
      conversations,
    });
  }

  /** Import a dump as a new workspace (new IDs; preserves titles/content/order). */
  importWorkspace(dump: WorkspaceExport): Workspace {
    const parsed = workspaceExportSchema.parse(dump);
    const workspace = this.createWorkspace(parsed.workspace.name);
    for (const entry of parsed.conversations) {
      const conversation = this.createConversation(
        workspace.id,
        entry.conversation.title
      );
      for (const message of entry.messages) {
        this.addMessage(conversation.id, message.role, message.content);
      }
    }
    return workspace;
  }

  listAgentProfiles(): AgentProfile[] {
    const rows = this.db
      .query<
        {
          id: string;
          name: string;
          instructions: string;
          tool_names: string;
          require_approval_for: string;
          run_timeout_ms: number;
          created_at: number;
          updated_at: number;
        },
        []
      >(
        `SELECT id, name, instructions, tool_names, require_approval_for,
                run_timeout_ms, created_at, updated_at
         FROM agent_profiles ORDER BY created_at DESC`
      )
      .all();
    return rows.map((row) =>
      agentProfileSchema.parse({
        id: row.id,
        name: row.name,
        instructions: row.instructions,
        toolNames: parseStringArray(row.tool_names),
        requireApprovalFor: parseStringArray(row.require_approval_for),
        runTimeoutMs: row.run_timeout_ms,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })
    );
  }

  ensureDefaultProfile(toolNames: string[]): AgentProfile {
    const existing = this.listAgentProfiles()[0];
    if (existing) {
      return existing;
    }
    return this.createAgentProfile({
      name: 'default',
      instructions: 'Local ctrl agent with sandboxed tools.',
      toolNames,
      requireApprovalFor: ['shell', 'fs_write'],
      runTimeoutMs: 60_000,
    });
  }

  createAgentProfile(input: {
    name: string;
    instructions?: string;
    toolNames?: string[];
    requireApprovalFor?: string[];
    runTimeoutMs?: number;
  }): AgentProfile {
    const now = Date.now();
    const profile = agentProfileSchema.parse({
      id: id('ap'),
      name: input.name,
      instructions: input.instructions ?? '',
      toolNames: input.toolNames ?? [],
      requireApprovalFor: input.requireApprovalFor ?? [],
      runTimeoutMs: input.runTimeoutMs ?? 60_000,
      createdAt: now,
      updatedAt: now,
    });
    this.db
      .query(
        `INSERT INTO agent_profiles(
          id, name, instructions, tool_names, require_approval_for,
          run_timeout_ms, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        profile.id,
        profile.name,
        profile.instructions,
        JSON.stringify(profile.toolNames),
        JSON.stringify(profile.requireApprovalFor),
        profile.runTimeoutMs,
        profile.createdAt,
        profile.updatedAt
      );
    return profile;
  }

  getAgentProfile(profileId: string): AgentProfile | null {
    return this.listAgentProfiles().find((p) => p.id === profileId) ?? null;
  }

  updateAgentProfile(
    profileId: string,
    input: {
      name?: string;
      instructions?: string;
      toolNames?: string[];
      requireApprovalFor?: string[];
      runTimeoutMs?: number;
    }
  ): AgentProfile {
    const existing = this.getAgentProfile(profileId);
    if (!existing) {
      throw new Error(`agent profile not found: ${profileId}`);
    }
    const now = Date.now();
    const profile = agentProfileSchema.parse({
      ...existing,
      name: input.name ?? existing.name,
      instructions: input.instructions ?? existing.instructions,
      toolNames: input.toolNames ?? existing.toolNames,
      requireApprovalFor:
        input.requireApprovalFor ?? existing.requireApprovalFor,
      runTimeoutMs: input.runTimeoutMs ?? existing.runTimeoutMs,
      updatedAt: now,
    });
    this.db
      .query(
        `UPDATE agent_profiles SET
          name = ?, instructions = ?, tool_names = ?,
          require_approval_for = ?, run_timeout_ms = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(
        profile.name,
        profile.instructions,
        JSON.stringify(profile.toolNames),
        JSON.stringify(profile.requireApprovalFor),
        profile.runTimeoutMs,
        profile.updatedAt,
        profile.id
      );
    return profile;
  }

  appendAudit(entry: {
    workspaceId?: string | null;
    conversationId?: string | null;
    runId?: string | null;
    action: AuditAction;
    detail?: unknown;
  }): AuditEntry {
    const row = auditEntrySchema.parse({
      id: id('aud'),
      workspaceId: entry.workspaceId ?? null,
      conversationId: entry.conversationId ?? null,
      runId: entry.runId ?? null,
      action: entry.action,
      detail: entry.detail,
      createdAt: Date.now(),
    });
    this.db
      .query(
        `INSERT INTO audit_logs(
          id, workspace_id, conversation_id, run_id, action, detail, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        row.id,
        row.workspaceId,
        row.conversationId,
        row.runId,
        row.action,
        row.detail === undefined ? null : JSON.stringify(row.detail),
        row.createdAt
      );
    return row;
  }

  listAudit(limit = 100): AuditEntry[] {
    const rows = this.db
      .query<
        {
          id: string;
          workspace_id: string | null;
          conversation_id: string | null;
          run_id: string | null;
          action: string;
          detail: string | null;
          created_at: number;
        },
        [number]
      >(
        `SELECT id, workspace_id, conversation_id, run_id, action, detail, created_at
         FROM audit_logs ORDER BY created_at DESC LIMIT ?`
      )
      .all(limit);
    return rows.map((row) =>
      auditEntrySchema.parse({
        id: row.id,
        workspaceId: row.workspace_id,
        conversationId: row.conversation_id,
        runId: row.run_id,
        action: row.action,
        detail: row.detail ? (JSON.parse(row.detail) as unknown) : undefined,
        createdAt: row.created_at,
      })
    );
  }
}
