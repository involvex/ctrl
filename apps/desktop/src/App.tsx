import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createBackup,
  createChannel,
  createConversation,
  createWorkspace,
  exportWorkspace,
  getProviderStatus,
  importWorkspace,
  inspectContext,
  listBackups,
  listChannels,
  listConversations,
  listMcpServers,
  listMemory,
  listMessages,
  listTools,
  listWorkspaces,
  restoreBackup,
  searchKnowledge,
  setClientAuth,
  streamChat,
  updateMemory,
  updateProviderConfig,
  uploadAttachmentText,
  type ChannelPublic,
  type Conversation,
  type HostBackupManifest,
  type KnowledgeHit,
  type McpServerInfo,
  type MemoryItem,
  type Message,
  type ProviderStatusResponse,
  type RunSession,
  type Workspace,
} from '@involvex/ctrl-i';
import {
  workspaceExportSchema,
  type ProviderId,
  type ToolCall,
  type ToolDefinition,
} from '@involvex/ctrl-s';
import { Markdown } from './markdown';

type PendingApproval = {
  approvalId: string;
  call: ToolCall;
  risk: 'low' | 'high';
  timeoutMs: number;
};

type DesktopApi = {
  platform: string;
  getGatewayUrl: () => Promise<string>;
  getGatewayStatus: () => Promise<{
    state: string;
    url?: string;
    error?: string;
    attempt?: number;
  }>;
  getLanUrls: () => Promise<string[]>;
  getAutostart: () => Promise<{ openAtLogin: boolean }>;
  setAutostart: (next: {
    openAtLogin: boolean;
  }) => Promise<{ openAtLogin: boolean }>;
  getUpdateStatus: () => Promise<{
    state: string;
    reason?: string;
    version?: string;
    message?: string;
  }>;
  checkForUpdates: () => Promise<{ state: string }>;
  secretsAvailable: () => Promise<boolean>;
  getGatewayToken: () => Promise<string | null>;
  rotateGatewayToken: () => Promise<string | null>;
  setOpenAiKey: (key: string) => Promise<{ ok: boolean }>;
  hasOpenAiKey: () => Promise<boolean>;
};

declare global {
  interface Window {
    ctrlGatewayUrl?: string;
    ctrlDesktop?: DesktopApi;
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
  const [hostOpen, setHostOpen] = useState(false);
  const [openAtLogin, setOpenAtLogin] = useState(false);
  const [secretsOk, setSecretsOk] = useState(false);
  const [gatewayToken, setGatewayToken] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [hasOpenAiKey, setHasOpenAiKey] = useState(false);
  const [openAiDraft, setOpenAiDraft] = useState('');
  const [updateLabel, setUpdateLabel] = useState('idle');
  const [knowledgeOpen, setKnowledgeOpen] = useState(false);
  const [knowledgeDraft, setKnowledgeDraft] = useState('');
  const [knowledgeFilename, setKnowledgeFilename] = useState('notes.md');
  const [knowledgeQuery, setKnowledgeQuery] = useState('');
  const [knowledgeHits, setKnowledgeHits] = useState<KnowledgeHit[]>([]);
  const [memoryItems, setMemoryItems] = useState<MemoryItem[]>([]);
  const [contextPreview, setContextPreview] = useState<string | null>(null);
  const [channelsOpen, setChannelsOpen] = useState(false);
  const [channelItems, setChannelItems] = useState<ChannelPublic[]>([]);
  const [channelName, setChannelName] = useState('webhook');
  const [backupsOpen, setBackupsOpen] = useState(false);
  const [backupItems, setBackupItems] = useState<HostBackupManifest[]>([]);
  const [backupLabel, setBackupLabel] = useState('manual');
  const [providersOpen, setProvidersOpen] = useState(false);
  const [providerStatus, setProviderStatus] =
    useState<ProviderStatusResponse | null>(null);
  const [providerKeyDraft, setProviderKeyDraft] = useState('');
  const [providerModelDraft, setProviderModelDraft] = useState('');
  const [toolsOpen, setToolsOpen] = useState(false);
  const [toolItems, setToolItems] = useState<ToolDefinition[]>([]);
  const [mcpServers, setMcpServers] = useState<McpServerInfo[]>([]);
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
    const api = window.ctrlDesktop;
    if (!api?.getGatewayToken) {
      return;
    }
    void (async () => {
      try {
        const [available, token, autostart, update, keyed] = await Promise.all([
          api.secretsAvailable(),
          api.getGatewayToken(),
          api.getAutostart(),
          api.getUpdateStatus(),
          api.hasOpenAiKey(),
        ]);
        setSecretsOk(available);
        setGatewayToken(token);
        setOpenAtLogin(autostart.openAtLogin);
        setUpdateLabel(update.state);
        setHasOpenAiKey(keyed);
        if (token) {
          setClientAuth({ token });
        }
      } catch {
        // browser / non-electron preview
      }
    })();
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

  const refreshProviders = useCallback(async () => {
    if (!gatewayUrl.startsWith('http')) {
      return;
    }
    try {
      const status = await getProviderStatus(gatewayUrl);
      setProviderStatus(status);
      setProviderModelDraft(status.model ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [gatewayUrl]);

  const refreshTools = useCallback(async () => {
    if (!gatewayUrl.startsWith('http')) {
      return;
    }
    try {
      const [tools, servers] = await Promise.all([
        listTools(gatewayUrl),
        listMcpServers(gatewayUrl),
      ]);
      setToolItems(tools);
      setMcpServers(servers);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [gatewayUrl]);

  const selectProvider = useCallback(
    async (id: ProviderId) => {
      if (!gatewayUrl.startsWith('http')) {
        return;
      }
      try {
        const patch: Parameters<typeof updateProviderConfig>[1] = {
          active: id,
        };
        if (
          providerKeyDraft.trim() &&
          (id === 'openai' || id === 'zen' || id === 'kilo')
        ) {
          if (id === 'openai') {
            patch.openai = { apiKey: providerKeyDraft.trim() };
          } else if (id === 'zen') {
            patch.zen = { apiKey: providerKeyDraft.trim() };
          } else {
            patch.kilo = { apiKey: providerKeyDraft.trim() };
          }
        }
        if (providerModelDraft.trim()) {
          patch.model = providerModelDraft.trim();
        }
        const status = await updateProviderConfig(gatewayUrl, patch);
        setProviderStatus(status);
        setProviderKeyDraft('');
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [gatewayUrl, providerKeyDraft, providerModelDraft]
  );

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

  const refreshChannels = useCallback(async () => {
    if (!workspace || !gatewayUrl.startsWith('http')) {
      return;
    }
    try {
      setChannelItems(await listChannels(gatewayUrl, workspace.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [gatewayUrl, workspace]);

  const refreshBackups = useCallback(async () => {
    if (!gatewayUrl.startsWith('http')) {
      return;
    }
    try {
      setBackupItems(await listBackups(gatewayUrl));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [gatewayUrl]);

  const onCreateBackup = useCallback(async () => {
    if (!gatewayUrl.startsWith('http')) {
      return;
    }
    try {
      await createBackup(gatewayUrl, {
        label: backupLabel.trim() || undefined,
        workspaceIds: workspace ? [workspace.id] : undefined,
      });
      await refreshBackups();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [backupLabel, gatewayUrl, refreshBackups, workspace]);

  const onRestoreBackup = useCallback(
    async (id: string) => {
      if (!gatewayUrl.startsWith('http')) {
        return;
      }
      try {
        const result = await restoreBackup(gatewayUrl, id);
        const restored = result.items[0];
        if (restored) {
          setWorkspace(restored);
          const conversations = await listConversations(
            gatewayUrl,
            restored.id
          );
          const first = conversations[0] ?? null;
          setConversation(first);
          setMessages(first ? await listMessages(gatewayUrl, first.id) : []);
        }
        await refreshBackups();
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [gatewayUrl, refreshBackups]
  );

  const onCreateWebhookChannel = useCallback(async () => {
    if (!workspace || !gatewayUrl.startsWith('http')) {
      return;
    }
    try {
      await createChannel(gatewayUrl, workspace.id, {
        kind: 'webhook',
        name: channelName.trim() || 'webhook',
      });
      await refreshChannels();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [channelName, gatewayUrl, refreshChannels, workspace]);

  const refreshKnowledge = useCallback(async () => {
    if (!workspace || !gatewayUrl.startsWith('http')) {
      return;
    }
    try {
      setMemoryItems(await listMemory(gatewayUrl, workspace.id));
      if (knowledgeQuery.trim()) {
        setKnowledgeHits(
          await searchKnowledge(gatewayUrl, workspace.id, knowledgeQuery.trim())
        );
      }
      const ctx = await inspectContext(gatewayUrl, workspace.id, {
        conversationId: conversation?.id,
        q: knowledgeQuery.trim() || undefined,
      });
      setContextPreview(ctx.assembledPreview);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [conversation, gatewayUrl, knowledgeQuery, workspace]);

  const onIngestNote = useCallback(async () => {
    if (
      !workspace ||
      !gatewayUrl.startsWith('http') ||
      !knowledgeDraft.trim()
    ) {
      return;
    }
    try {
      await uploadAttachmentText(gatewayUrl, workspace.id, {
        filename: knowledgeFilename.trim() || 'notes.md',
        mimeType: 'text/markdown',
        text: knowledgeDraft,
        conversationId: conversation?.id,
      });
      setKnowledgeDraft('');
      await refreshKnowledge();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [
    conversation,
    gatewayUrl,
    knowledgeDraft,
    knowledgeFilename,
    refreshKnowledge,
    workspace,
  ]);

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
          <button
            type="button"
            className="ghost-btn"
            onClick={() => setHostOpen((v) => !v)}
          >
            host
          </button>
          <button
            type="button"
            className="ghost-btn"
            onClick={() => {
              setKnowledgeOpen((v) => !v);
              if (!knowledgeOpen) {
                void refreshKnowledge();
              }
            }}
          >
            knowledge
          </button>
          <button
            type="button"
            className="ghost-btn"
            onClick={() => {
              setChannelsOpen((v) => !v);
              if (!channelsOpen) {
                void refreshChannels();
              }
            }}
          >
            channels
          </button>
          <button
            type="button"
            className="ghost-btn"
            onClick={() => {
              setProvidersOpen((v) => !v);
              if (!providersOpen) {
                void refreshProviders();
              }
            }}
          >
            providers
          </button>
          <button
            type="button"
            className="ghost-btn"
            onClick={() => {
              setToolsOpen((v) => !v);
              if (!toolsOpen) {
                void refreshTools();
              }
            }}
          >
            tools
          </button>
          <button
            type="button"
            className="ghost-btn"
            onClick={() => {
              setBackupsOpen((v) => !v);
              if (!backupsOpen) {
                void refreshBackups();
              }
            }}
          >
            backups
          </button>
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

      {hostOpen ? (
        <aside className="host-panel">
          <p className="host-title">desktop host</p>
          <label className="host-row">
            <input
              type="checkbox"
              checked={openAtLogin}
              onChange={(e) => {
                const next = e.target.checked;
                setOpenAtLogin(next);
                void window.ctrlDesktop?.setAutostart({ openAtLogin: next });
              }}
            />
            open at login
          </label>
          <p className="meta">
            safeStorage: {secretsOk ? 'available' : 'unavailable'} · updates:{' '}
            {updateLabel}
          </p>
          <div className="host-row">
            <button
              type="button"
              className="ghost-btn"
              onClick={() => {
                void window.ctrlDesktop?.checkForUpdates().then((s) => {
                  setUpdateLabel(s.state);
                  return undefined;
                });
              }}
            >
              check updates
            </button>
          </div>
          <p className="meta">
            pairing token{' '}
            {gatewayToken
              ? showToken
                ? gatewayToken
                : `${gatewayToken.slice(0, 10)}…`
              : '(none)'}
          </p>
          <div className="host-row">
            <button
              type="button"
              className="ghost-btn"
              onClick={() => setShowToken((v) => !v)}
              disabled={!gatewayToken}
            >
              {showToken ? 'hide' : 'reveal'}
            </button>
            <button
              type="button"
              className="ghost-btn"
              disabled={!gatewayToken}
              onClick={() => {
                if (gatewayToken) {
                  void navigator.clipboard.writeText(gatewayToken);
                }
              }}
            >
              copy
            </button>
            <button
              type="button"
              className="ghost-btn"
              onClick={() => {
                void window.ctrlDesktop?.rotateGatewayToken().then((t) => {
                  setGatewayToken(t);
                  if (t) {
                    setClientAuth({ token: t });
                  }
                  setError(
                    'Token rotated — restart the app so the gateway picks it up.'
                  );
                  return undefined;
                });
              }}
            >
              rotate
            </button>
          </div>
          <p className="meta">
            OpenAI key: {hasOpenAiKey ? 'saved in safeStorage' : 'not set'}
          </p>
          <div className="host-row">
            <input
              className="host-input"
              type="password"
              placeholder="sk-… (saved encrypted)"
              value={openAiDraft}
              onChange={(e) => setOpenAiDraft(e.target.value)}
            />
            <button
              type="button"
              className="ghost-btn"
              disabled={openAiDraft.trim().length === 0}
              onClick={() => {
                void window.ctrlDesktop
                  ?.setOpenAiKey(openAiDraft.trim())
                  .then(() => {
                    setHasOpenAiKey(true);
                    setOpenAiDraft('');
                    setError(
                      'API key saved — restart the app to apply to the gateway.'
                    );
                    return undefined;
                  });
              }}
            >
              save key
            </button>
          </div>
          {lanUrls.length > 0 ? (
            <p className="meta">
              mobile: use LAN URL + Bearer token from safeStorage
            </p>
          ) : null}
        </aside>
      ) : null}

      {providersOpen ? (
        <aside className="host-panel knowledge-panel">
          <p className="host-title">providers</p>
          <p className="meta">
            active · {providerStatus?.active ?? '…'}
            {providerStatus?.model ? ` · model ${providerStatus.model}` : ''}
          </p>
          <div className="host-row">
            <input
              className="host-input"
              placeholder="API key (zen / kilo / openai)"
              type="password"
              value={providerKeyDraft}
              onChange={(e) => setProviderKeyDraft(e.target.value)}
            />
            <input
              className="host-input"
              placeholder="model id"
              value={providerModelDraft}
              onChange={(e) => setProviderModelDraft(e.target.value)}
            />
            <button
              type="button"
              className="ghost-btn"
              onClick={() => {
                void refreshProviders();
              }}
            >
              refresh
            </button>
          </div>
          <ul className="knowledge-list">
            {(providerStatus?.providers ?? []).map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="ghost-btn"
                  disabled={!p.available && p.id !== 'mock'}
                  onClick={() => {
                    void selectProvider(p.id);
                  }}
                >
                  {p.id === providerStatus?.active ? '●' : '○'} {p.label}
                </button>{' '}
                <span className="meta">
                  {p.kind}
                  {p.configured ? ' · configured' : ' · needs key'}
                  {p.unavailableReason ? ` · ${p.unavailableReason}` : ''}
                </span>
              </li>
            ))}
          </ul>
          <p className="meta">
            zen → opencode.ai/zen · kilo → ai-gateway.kilo.ai · llama → local
            sidecar · litert → mobile on-device · device → paired gateway
          </p>
        </aside>
      ) : null}

      {toolsOpen ? (
        <aside className="host-panel knowledge-panel">
          <p className="host-title">tools / MCP</p>
          <div className="host-row">
            <button
              type="button"
              className="ghost-btn"
              onClick={() => {
                void refreshTools();
              }}
            >
              refresh
            </button>
          </div>
          <p className="host-title">MCP servers</p>
          <ul className="knowledge-list">
            {mcpServers.map((server) => (
              <li key={server.id}>
                <code>{server.id}</code> {server.name}
                {server.command
                  ? ` · ${server.command} ${(server.args ?? []).join(' ')}`
                  : ' · stub'}
              </li>
            ))}
          </ul>
          {mcpServers.length === 0 ? (
            <p className="meta">no MCP servers</p>
          ) : null}
          <p className="host-title">registered tools</p>
          <ul className="knowledge-list">
            {toolItems.map((tool) => (
              <li key={tool.name}>
                <code>{tool.name}</code> [{tool.risk}]
                {tool.requiresApproval ? ' · approval' : ''} —{' '}
                {tool.description}
              </li>
            ))}
          </ul>
        </aside>
      ) : null}

      {channelsOpen ? (
        <aside className="host-panel knowledge-panel">
          <p className="host-title">channels</p>
          <p className="meta">
            webhook · telegram · discord · slack (MVP adapters)
          </p>
          <div className="host-row">
            <input
              className="host-input"
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
              placeholder="channel name"
            />
            <button
              type="button"
              className="demo-btn"
              onClick={() => {
                void onCreateWebhookChannel();
              }}
              disabled={!workspace}
            >
              add webhook
            </button>
          </div>
          <ul className="knowledge-list">
            {channelItems.map((ch) => (
              <li key={ch.id}>
                <code>{ch.kind}</code> {ch.name} · {ch.status}
                {ch.lastError ? ` · ${ch.lastError}` : ''}
              </li>
            ))}
          </ul>
          {channelItems.length === 0 ? (
            <p className="meta">no channels yet</p>
          ) : null}
        </aside>
      ) : null}

      {backupsOpen ? (
        <aside className="host-panel knowledge-panel">
          <p className="host-title">host backups</p>
          <p className="meta">
            Snapshots on this machine (`data/backups`). Restore creates new
            workspaces — no peer SQLite sync.
          </p>
          <div className="host-row">
            <input
              className="host-input"
              value={backupLabel}
              onChange={(e) => setBackupLabel(e.target.value)}
              placeholder="label"
            />
            <button
              type="button"
              className="demo-btn"
              onClick={() => {
                void onCreateBackup();
              }}
            >
              snapshot
            </button>
            <button
              type="button"
              className="ghost-btn"
              onClick={() => {
                void refreshBackups();
              }}
            >
              refresh
            </button>
          </div>
          <ul className="knowledge-list">
            {backupItems.map((b) => (
              <li key={b.id}>
                <code>{b.label ?? b.id.slice(0, 8)}</code> · {b.workspaceCount}{' '}
                ws · {new Date(b.createdAt).toLocaleString()}
                <div className="host-row">
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() => {
                      void onRestoreBackup(b.id);
                    }}
                  >
                    restore
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {backupItems.length === 0 ? (
            <p className="meta">no backups yet</p>
          ) : null}
        </aside>
      ) : null}

      {knowledgeOpen ? (
        <aside className="host-panel knowledge-panel">
          <p className="host-title">personal knowledge</p>
          <div className="host-row">
            <input
              className="host-input"
              value={knowledgeFilename}
              onChange={(e) => setKnowledgeFilename(e.target.value)}
              placeholder="filename.md"
            />
          </div>
          <textarea
            className="knowledge-draft"
            rows={4}
            value={knowledgeDraft}
            onChange={(e) => setKnowledgeDraft(e.target.value)}
            placeholder="Paste notes to ingest (text/markdown)…"
          />
          <div className="host-row">
            <button
              type="button"
              className="demo-btn"
              onClick={() => {
                void onIngestNote();
              }}
              disabled={!workspace || knowledgeDraft.trim().length === 0}
            >
              ingest
            </button>
          </div>
          <div className="host-row">
            <input
              className="host-input"
              value={knowledgeQuery}
              onChange={(e) => setKnowledgeQuery(e.target.value)}
              placeholder="FTS query…"
            />
            <button
              type="button"
              className="ghost-btn"
              onClick={() => {
                void refreshKnowledge();
              }}
            >
              search / inspect
            </button>
          </div>
          {knowledgeHits.length > 0 ? (
            <ul className="knowledge-list">
              {knowledgeHits.map((hit) => (
                <li key={hit.chunkId}>
                  <code>{hit.filename}</code> — {hit.snippet}
                </li>
              ))}
            </ul>
          ) : null}
          <p className="host-title">memory review</p>
          <ul className="knowledge-list">
            {memoryItems.map((item) => (
              <li key={item.id}>
                <span className="meta">
                  [{item.status}] {item.kind}
                  {item.pinned ? ' ★' : ''}
                </span>{' '}
                {item.content.slice(0, 160)}
                <div className="host-row">
                  {item.status === 'pending_review' ? (
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() => {
                        void updateMemory(gatewayUrl, item.id, {
                          status: 'active',
                          pinned: true,
                        }).then(() => refreshKnowledge());
                      }}
                    >
                      approve + pin
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() => {
                      void updateMemory(gatewayUrl, item.id, {
                        status: 'archived',
                      }).then(() => refreshKnowledge());
                    }}
                  >
                    archive
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {contextPreview ? (
            <>
              <p className="host-title">context inspector</p>
              <pre className="context-preview">{contextPreview}</pre>
            </>
          ) : null}
        </aside>
      ) : null}

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
