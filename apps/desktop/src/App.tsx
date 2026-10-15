import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createConversation,
  createWorkspace,
  exportWorkspace,
  importWorkspace,
  listConversations,
  listMessages,
  listWorkspaces,
  streamChat,
  type Conversation,
  type Message,
  type RunSession,
  type Workspace,
} from '@involvex/ctrl-i';
import { workspaceExportSchema, type ToolCall } from '@involvex/ctrl-s';
import { Markdown } from './markdown';

type PendingApproval = {
  approvalId: string;
  call: ToolCall;
  risk: 'low' | 'high';
  timeoutMs: number;
};

declare global {
  interface Window {
    ctrlGatewayUrl?: string;
    ctrlDesktop?: {
      platform: string;
      getGatewayUrl: () => Promise<string>;
      getGatewayStatus: () => Promise<{
        state: string;
        url?: string;
        error?: string;
        attempt?: number;
      }>;
      getLanUrls: () => Promise<string[]>;
    };
  }
}

export function App() {
  const [gatewayUrl, setGatewayUrl] = useState(
    window.ctrlGatewayUrl ?? 'starting…'
  );
  const [status, setStatus] = useState('starting');
  const [lanUrls, setLanUrls] = useState<string[]>([]);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingApproval, setPendingApproval] =
    useState<PendingApproval | null>(null);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const sessionRef = useRef<RunSession | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function refresh(): Promise<void> {
      const api = window.ctrlDesktop;
      if (!api) {
        return;
      }
      try {
        const [url, st, lan] = await Promise.all([
          api.getGatewayUrl(),
          api.getGatewayStatus(),
          api.getLanUrls(),
        ]);
        if (cancelled) {
          return;
        }
        setGatewayUrl(url);
        setStatus(st.state);
        setLanUrls(lan);
      } catch {
        if (!cancelled) {
          setStatus('unavailable');
        }
      }
    }

    void refresh();
    const id = window.setInterval(() => {
      void refresh();
    }, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (status === 'running' && gatewayUrl.startsWith('http')) {
      void (async () => {
        try {
          const workspaces = await listWorkspaces(gatewayUrl);
          let ws = workspaces[0] ?? null;
          if (!ws) {
            ws = await createWorkspace(gatewayUrl, 'Local');
          }
          if (cancelled) {
            return;
          }
          setWorkspace(ws);
          const conversations = await listConversations(gatewayUrl, ws.id);
          let cv = conversations[0] ?? null;
          if (!cv) {
            cv = await createConversation(gatewayUrl, ws.id, 'Chat');
          }
          if (cancelled) {
            return;
          }
          setConversation(cv);
          setMessages(await listMessages(gatewayUrl, cv.id));
          setError(null);
        } catch (err) {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : String(err));
          }
        }
      })();
    }
    return () => {
      cancelled = true;
    };
  }, [gatewayUrl, status]);

  useEffect(() => {
    const length = messages.length + (streaming ? 1 : 0);
    if (length === 0) {
      return;
    }
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, streaming]);

  const send = useCallback(() => {
    if (
      !conversation ||
      !gatewayUrl.startsWith('http') ||
      busy ||
      draft.trim().length === 0
    ) {
      return;
    }
    const content = draft.trim();
    setDraft('');
    setBusy(true);
    setStreaming('');
    setError(null);
    setMessages((prev) => [
      ...prev,
      {
        id: `local_${Date.now()}`,
        conversationId: conversation.id,
        role: 'user',
        content,
        createdAt: Date.now(),
      },
    ]);

    sessionRef.current?.close();
    setPendingApproval(null);
    setToolStatus(null);
    sessionRef.current = streamChat(gatewayUrl, conversation.id, content, {
      onEvent: (event) => {
        if (event.type === 'message.delta') {
          setStreaming((prev) => prev + event.text);
        }
        if (event.type === 'tool.requested') {
          setToolStatus(`tool requested: ${event.call.name}`);
        }
        if (event.type === 'tool.started') {
          setToolStatus(`tool running…`);
        }
        if (event.type === 'tool.completed') {
          setToolStatus(`tool done`);
        }
        if (event.type === 'approval.requested') {
          setPendingApproval({
            approvalId: event.approvalId,
            call: event.call,
            risk: event.risk,
            timeoutMs: event.timeoutMs,
          });
        }
        if (event.type === 'approval.resolved') {
          setPendingApproval(null);
        }
        if (event.type === 'run.failed') {
          setError(event.error.message);
          setBusy(false);
          setStreaming('');
          setPendingApproval(null);
        }
        if (event.type === 'run.cancelled') {
          setError(event.reason ?? 'cancelled');
          setBusy(false);
          setPendingApproval(null);
        }
        if (event.type === 'run.completed') {
          setBusy(false);
          setPendingApproval(null);
        }
      },
      onError: (err) => {
        setError(err.message);
        setBusy(false);
      },
      onClose: () => {
        void (async () => {
          const items = await listMessages(gatewayUrl, conversation.id);
          setMessages(items);
          setStreaming('');
          setBusy(false);
          setPendingApproval(null);
          setToolStatus(null);
          sessionRef.current = null;
        })();
      },
    });
  }, [busy, conversation, draft, gatewayUrl]);

  const stop = useCallback(() => {
    sessionRef.current?.cancel('user stop');
    sessionRef.current = null;
    setPendingApproval(null);
    setBusy(false);
  }, []);

  const decide = useCallback(
    (decision: 'approved' | 'denied') => {
      if (!pendingApproval || !sessionRef.current) {
        return;
      }
      sessionRef.current.resolveApproval(pendingApproval.approvalId, decision);
      setPendingApproval(null);
    },
    [pendingApproval]
  );

  const onExport = useCallback(async () => {
    if (!workspace || !gatewayUrl.startsWith('http')) {
      return;
    }
    try {
      const dump = await exportWorkspace(gatewayUrl, workspace.id);
      const blob = new Blob([JSON.stringify(dump, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ctrl-${workspace.name.replace(/\s+/g, '-')}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [gatewayUrl, workspace]);

  const onImportFile = useCallback(
    async (file: File) => {
      if (!gatewayUrl.startsWith('http')) {
        return;
      }
      try {
        const dump = workspaceExportSchema.parse(
          JSON.parse(await file.text()) as unknown
        );
        const ws = await importWorkspace(gatewayUrl, dump);
        setWorkspace(ws);
        const conversations = await listConversations(gatewayUrl, ws.id);
        const cv =
          conversations[0] ??
          (await createConversation(gatewayUrl, ws.id, 'Chat'));
        setConversation(cv);
        setMessages(await listMessages(gatewayUrl, cv.id));
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [gatewayUrl]
  );

  return (
    <div className="shell">
      <header className="top">
        <h1 className="brand">ctrl</h1>
        <p className="meta">
          gateway [{status}] → {gatewayUrl}
        </p>
        {lanUrls.length > 0 ? (
          <p className="meta lan">LAN: {lanUrls.join(' · ')}</p>
        ) : null}
        <div className="actions">
          <button type="button" className="ghost-btn" onClick={onExport}>
            export
          </button>
          <button
            type="button"
            className="ghost-btn"
            onClick={() => fileRef.current?.click()}
          >
            import
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                void onImportFile(file);
              }
              e.target.value = '';
            }}
          />
        </div>
      </header>

      <section className="chat">
        {messages.map((m) => (
          <article key={m.id} className={`bubble ${m.role}`}>
            <span className="role">{m.role}</span>
            {m.role === 'assistant' ? (
              <Markdown text={m.content} />
            ) : (
              <p className="plain">{m.content}</p>
            )}
          </article>
        ))}
        {streaming ? (
          <article className="bubble assistant streaming">
            <span className="role">assistant</span>
            <Markdown text={streaming} />
          </article>
        ) : null}
        <div ref={bottomRef} />
      </section>

      {toolStatus ? <p className="meta tool-status">{toolStatus}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {pendingApproval ? (
        <aside className="approval">
          <p className="approval-title">
            approve tool <code>{pendingApproval.call.name}</code> [
            {pendingApproval.risk}]
          </p>
          <pre className="approval-args">
            {JSON.stringify(pendingApproval.call.arguments, null, 2)}
          </pre>
          <div className="approval-actions">
            <button
              type="button"
              className="demo-btn"
              onClick={() => decide('approved')}
            >
              approve
            </button>
            <button
              type="button"
              className="ghost-btn"
              onClick={() => decide('denied')}
            >
              deny
            </button>
          </div>
        </aside>
      ) : null}

      <footer className="composer">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Message… or /tool fs_list .  ·  /tool shell echo hi"
          rows={3}
          disabled={status !== 'running' || !conversation}
        />
        {busy ? (
          <button type="button" className="demo-btn" onClick={stop}>
            stop
          </button>
        ) : (
          <button
            type="button"
            className="demo-btn"
            onClick={send}
            disabled={
              status !== 'running' || !conversation || draft.trim().length === 0
            }
          >
            send
          </button>
        )}
      </footer>
    </div>
  );
}
