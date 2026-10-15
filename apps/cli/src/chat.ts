import {
  createConversation,
  createWorkspace,
  listConversations,
  listMessages,
  listWorkspaces,
  setClientAuth,
  streamChat,
  type RunSession,
} from '@involvex/ctrl-i';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

export function applyCliAuth(token?: string): void {
  const value = token ?? process.env['CTRL_GATEWAY_TOKEN'] ?? '';
  if (value) {
    setClientAuth({ token: value });
  }
}

async function ensureConversation(
  baseUrl: string
): Promise<{ workspaceId: string; conversationId: string }> {
  const workspaces = await listWorkspaces(baseUrl);
  let workspace = workspaces[0] ?? null;
  if (!workspace) {
    workspace = await createWorkspace(baseUrl, 'CLI');
  }
  const conversations = await listConversations(baseUrl, workspace.id);
  let conversation = conversations[0] ?? null;
  if (!conversation) {
    conversation = await createConversation(baseUrl, workspace.id, 'CLI chat');
  }
  return { workspaceId: workspace.id, conversationId: conversation.id };
}

function runOnce(
  baseUrl: string,
  conversationId: string,
  content: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    let assembled = '';
    let session: RunSession | null = null;
    session = streamChat(baseUrl, conversationId, content, {
      onEvent: (event) => {
        if (event.type === 'message.delta') {
          assembled += event.text;
          process.stdout.write(event.text);
        }
        if (event.type === 'run.completed') {
          process.stdout.write('\n');
          session?.close();
          resolve(assembled);
        }
        if (event.type === 'run.failed') {
          session?.close();
          reject(new Error(event.error.message));
        }
        if (event.type === 'tool.requested') {
          process.stderr.write(
            `\n[tool] ${event.call.name} · waiting for approval on another client\n`
          );
        }
      },
      onError: (err) => {
        session?.close();
        reject(err);
      },
    });
  });
}

/** One-shot or interactive TTY chat against a running gateway. */
export async function chatCommand(
  baseUrl: string,
  messageParts: string[],
  token?: string
): Promise<void> {
  applyCliAuth(token);
  console.error(`chat · connecting ${baseUrl}`);
  const { conversationId } = await ensureConversation(baseUrl);
  console.error(`chat · conversation ${conversationId}`);

  const oneshot = messageParts.join(' ').trim();
  if (oneshot) {
    await runOnce(baseUrl, conversationId, oneshot);
    return;
  }

  if (!input.isTTY) {
    throw new Error(
      'interactive chat needs a TTY — pass a message: ctrl-f5 chat "hello"'
    );
  }

  const rl = readline.createInterface({ input, output });
  console.error('type a message (empty / Ctrl+C to quit)');

  const onSig = () => {
    rl.close();
  };
  process.once('SIGINT', onSig);
  process.once('SIGTERM', onSig);

  try {
    for (;;) {
      const line = await rl.question('you> ');
      const text = line.trim();
      if (!text) {
        break;
      }
      process.stdout.write('assistant> ');
      await runOnce(baseUrl, conversationId, text);
      const recent = await listMessages(baseUrl, conversationId);
      if (recent.length === 0) {
        // keep going
      }
    }
  } finally {
    process.off('SIGINT', onSig);
    process.off('SIGTERM', onSig);
    rl.close();
  }
}
