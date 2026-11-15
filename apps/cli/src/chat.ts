import {
  createConversation,
  createWorkspace,
  listConversations,
  listMessages,
  listWorkspaces,
  setClientAuth,
  streamApprovals,
  streamChat,
  type ApprovalSession,
  type RunSession,
} from '@involvex/ctrl-i';
import type { ToolCall } from '@involvex/ctrl-s';
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

type ApprovalPrompt = {
  approvalId: string;
  call: ToolCall;
  risk: 'low' | 'high';
  source?: 'chat' | 'channel';
  channelId?: string;
};

function formatApprovalBanner(req: ApprovalPrompt): string {
  const source =
    req.source === 'channel'
      ? `channel${req.channelId ? ` ${req.channelId}` : ''}`
      : 'chat';
  return (
    `\n[approval] ${req.call.name} [${req.risk}] · ${source}\n` +
    `${JSON.stringify(req.call.arguments, null, 2)}\n`
  );
}

/**
 * Interactive TTY: prompt y/n. Non-TTY: auto-deny (no hang).
 */
async function decideApproval(
  req: ApprovalPrompt,
  rl: readline.Interface | null
): Promise<'approved' | 'denied'> {
  process.stderr.write(formatApprovalBanner(req));
  if (!rl || !input.isTTY) {
    process.stderr.write('[approval] non-TTY · auto-deny\n');
    return 'denied';
  }
  const answer = (await rl.question('approve tool? [y/N] '))
    .trim()
    .toLowerCase();
  if (answer === 'y' || answer === 'yes') {
    return 'approved';
  }
  return 'denied';
}

function runOnce(
  baseUrl: string,
  conversationId: string,
  content: string,
  rl: readline.Interface | null
): Promise<string> {
  return new Promise((resolve, reject) => {
    let assembled = '';
    let session: RunSession | null = null;
    let deciding = false;
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
          process.stderr.write(`\n[tool] ${event.call.name}\n`);
        }
        if (event.type === 'approval.requested' && !deciding) {
          deciding = true;
          void (async () => {
            try {
              const decision = await decideApproval(
                {
                  approvalId: event.approvalId,
                  call: event.call,
                  risk: event.risk,
                  source: event.source ?? 'chat',
                  ...(event.channelId ? { channelId: event.channelId } : {}),
                },
                rl
              );
              session?.resolveApproval(event.approvalId, decision);
            } finally {
              deciding = false;
            }
          })();
        }
      },
      onError: (err) => {
        session?.close();
        reject(err);
      },
    });
  });
}

function openApprovalsListener(
  baseUrl: string,
  workspaceId: string,
  rl: readline.Interface | null
): ApprovalSession {
  let session: ApprovalSession | null = null;
  session = streamApprovals(baseUrl, workspaceId, {
    onEvent: (event) => {
      if (event.type !== 'approval.requested' || event.source !== 'channel') {
        return;
      }
      void (async () => {
        const decision = await decideApproval(
          {
            approvalId: event.approvalId,
            call: event.call,
            risk: event.risk,
            source: 'channel',
            ...(event.channelId ? { channelId: event.channelId } : {}),
          },
          rl
        );
        session?.resolveApproval(event.approvalId, decision);
      })();
    },
  });
  return session;
}

/** One-shot or interactive TTY chat against a running gateway. */
export async function chatCommand(
  baseUrl: string,
  messageParts: string[],
  token?: string
): Promise<void> {
  applyCliAuth(token);
  console.error(`chat · connecting ${baseUrl}`);
  const { workspaceId, conversationId } = await ensureConversation(baseUrl);
  console.error(`chat · conversation ${conversationId}`);

  const oneshot = messageParts.join(' ').trim();
  if (oneshot) {
    const approvals = openApprovalsListener(baseUrl, workspaceId, null);
    try {
      await runOnce(baseUrl, conversationId, oneshot, null);
    } finally {
      approvals.close();
    }
    return;
  }

  if (!input.isTTY) {
    throw new Error(
      'interactive chat needs a TTY — pass a message: ctrl-f5 chat "hello"'
    );
  }

  const rl = readline.createInterface({ input, output });
  console.error('type a message (empty / Ctrl+C to quit)');
  console.error('tool approvals: y/N when prompted (channel + chat)');

  const approvals = openApprovalsListener(baseUrl, workspaceId, rl);

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
      await runOnce(baseUrl, conversationId, text, rl);
      await listMessages(baseUrl, conversationId);
    }
  } finally {
    process.off('SIGINT', onSig);
    process.off('SIGTERM', onSig);
    approvals.close();
    rl.close();
  }
}
