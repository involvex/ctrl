import type { Database } from 'bun:sqlite';
import {
  messageRoleSchema,
  workspaceExportSchema,
  type Conversation,
  type Message,
  type MessageRole,
  type Workspace,
  type WorkspaceExport,
} from '@involvex/ctrl-s';

function id(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`;
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
}
