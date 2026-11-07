import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createBackup,
  createChannel,
  createConversation,
  createWorkspace,
  deleteChannel,
  exportWorkspace,
  getEmbeddingStatus,
  getProviderStatus,
  importWorkspace,
  inspectContext,
  listBackups,
  listChannels,
  listConversations,
  listHfModelCatalog,
  listMcpServers,
  listMemory,
  listMessages,
  listTools,
  listModels,
  listWorkspaces,
  postChannelWebhook,
  reindexKnowledge,
  restoreBackup,
  searchKnowledge,
  sendChannelMessage,
  setClientAuth,
  streamChat,
  updateMemory,
  updateProviderConfig,
  uploadAttachmentText,
  type ChannelPublic,
  type Conversation,
  type EmbeddingStatus,
  type HfModelCatalogEntry,
  type HostBackupManifest,
  type KnowledgeHit,
  type KnowledgeSearchMode,
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
import { PairQr } from './pair-qr';

type PendingApproval = {
  approvalId: string;
  call: ToolCall;
  risk: 'low' | 'high';
  timeoutMs: number;
};

/** Narrow the `<select>` value without an unchecked cast. */
function toKnowledgeSearchMode(value: string): KnowledgeSearchMode {
  if (value === 'vector' || value === 'fts') {
    return value;
  }
  return 'hybrid';
}

/** Exclusive side panels — opening one closes the others. */
type DesktopPanel =
  'host' | 'knowledge' | 'channels' | 'providers' | 'tools' | 'backups' | null;

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
  listLocalBackends: () => Promise<LocalBackendRow[]>;
  startLocalBackend: (id: string) => Promise<LocalBackendRow>;
  stopLocalBackend: (id: string) => Promise<LocalBackendRow>;
  setLocalBackendBin: (id: string, binPath: string) => Promise<{ ok: boolean }>;
  pickLocalBackendBin: (
    id: string
  ) => Promise<{ ok: boolean; path: string | null }>;
  downloadLocalBackendBin: (
    id: string,
    url: string
  ) => Promise<{ ok: boolean; path: string }>;
  onDownloadProgress?: (
    callback: (info: {
      id: string;
      downloaded: number;
      total?: number;
      percent?: number;
      done?: boolean;
    }) => void
  ) => () => void;
};

type LocalBackendRow = {
  id: string;
  port: number;
  running: boolean;
  baseUrl: string;
  modelsPreview: string[];
  binFound: boolean;
  binPath: string | null;
  installHint: string;
  error?: string;
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
  const [openPanel, setOpenPanel] = useState<DesktopPanel>(null);
  const [openAtLogin, setOpenAtLogin] = useState(false);
  const [secretsOk, setSecretsOk] = useState(false);
  const [gatewayToken, setGatewayToken] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [hasOpenAiKey, setHasOpenAiKey] = useState(false);
  const [openAiDraft, setOpenAiDraft] = useState('');
  const [updateLabel, setUpdateLabel] = useState('idle');
  const [knowledgeDraft, setKnowledgeDraft] = useState('');
  const [knowledgeFilename, setKnowledgeFilename] = useState('notes.md');
  const [knowledgeQuery, setKnowledgeQuery] = useState('');
  const [knowledgeMode, setKnowledgeMode] =
    useState<KnowledgeSearchMode>('hybrid');
  const [embeddingStatus, setEmbeddingStatus] =
    useState<EmbeddingStatus | null>(null);
  const [knowledgeHits, setKnowledgeHits] = useState<KnowledgeHit[]>([]);
  const [memoryItems, setMemoryItems] = useState<MemoryItem[]>([]);
  const [contextPreview, setContextPreview] = useState<string | null>(null);
  const [contextTokenEstimate, setContextTokenEstimate] = useState<
    number | null
  >(null);
  const [firstRunDismissed, setFirstRunDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('ctrl.firstRunDismissed') === '1';
    } catch {
      return false;
    }
  });
  const [channelItems, setChannelItems] = useState<ChannelPublic[]>([]);
  const [channelKind, setChannelKind] = useState<'webhook' | 'telegram'>(
    'webhook'
  );
  const [channelName, setChannelName] = useState('webhook');
  const [channelBotToken, setChannelBotToken] = useState('');
  const [channelTestRecipient, setChannelTestRecipient] = useState('');
  const [binPathDrafts, setBinPathDrafts] = useState<Record<string, string>>(
    {}
  );
  const [backupItems, setBackupItems] = useState<HostBackupManifest[]>([]);
  const [backupLabel, setBackupLabel] = useState('manual');
  const [backupPassphrase, setBackupPassphrase] = useState('');
  const [providerStatus, setProviderStatus] =
    useState<ProviderStatusResponse | null>(null);
  const [localBackends, setLocalBackends] = useState<LocalBackendRow[]>([]);
  const [binDownloadId, setBinDownloadId] = useState<'llama' | 'litert-lm'>(
    'llama'
  );
  const [binDownloadUrl, setBinDownloadUrl] = useState('');
  const [downloadProgress, setDownloadProgress] = useState<{
    id: string;
    downloaded: number;
    total?: number;
    percent?: number;
    done?: boolean;
  } | null>(null);
  const [modelItems, setModelItems] = useState<
    Array<{ id: string; displayName?: string }>
  >([]);
  const [hfModels, setHfModels] = useState<HfModelCatalogEntry[]>([]);
  const [providerKeyDraft, setProviderKeyDraft] = useState('');
  const [providerModelDraft, setProviderModelDraft] = useState('');
  const [toolItems, setToolItems] = useState<ToolDefinition[]>([]);
  const [mcpServers, setMcpServers] = useState<McpServerInfo[]>([]);
  const hostOpen = openPanel === 'host';
  const knowledgeOpen = openPanel === 'knowledge';
  const channelsOpen = openPanel === 'channels';
  const providersOpen = openPanel === 'providers';
  const toolsOpen = openPanel === 'tools';
  const backupsOpen = openPanel === 'backups';

  const togglePanel = useCallback(
    (panel: Exclude<DesktopPanel, null>, onOpen?: () => void) => {
      setOpenPanel((prev) => {
        if (prev === panel) {
          return null;
        }
        if (onOpen) {
          queueMicrotask(onOpen);
        }
        return panel;
      });
    },
    []
  );
  const sessionRef = useRef<RunSession | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const refreshLocalBackends = useCallback(async () => {
    const api = window.ctrlDesktop;
    if (!api?.listLocalBackends) {
      return;
    }
    try {
      const rows = await api.listLocalBackends();
      setLocalBackends(rows);
      setBinPathDrafts((prev) => {
        const next = { ...prev };
        for (const row of rows) {
          if (next[row.id] === undefined) {
            next[row.id] = row.binPath ?? '';
          }
        }
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

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
    if (!api?.onDownloadProgress) {
      return;
    }
    const unsub = api.onDownloadProgress((info) => {
      setDownloadProgress(info);
      if (info.done) {
        void refreshLocalBackends();
        setTimeout(() => setDownloadProgress(null), 3000);
      }
    });
    return () => unsub();
  }, [refreshLocalBackends]);

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

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && openPanel !== null) {
        setOpenPanel(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [openPanel]);

  const refreshModels = useCallback(async () => {
    if (!gatewayUrl.startsWith('http')) {
      return;
    }
    try {
      const listed = await listModels(gatewayUrl);
      setModelItems(listed.items);
    } catch {
      setModelItems([]);
    }
  }, [gatewayUrl]);

  const refreshHfModels = useCallback(async () => {
    if (!gatewayUrl.startsWith('http')) {
      return;
    }
    try {
      const listed = await listHfModelCatalog(gatewayUrl);
      setHfModels(listed.items);
    } catch {
      setHfModels([]);
    }
  }, [gatewayUrl]);

  const refreshProviders = useCallback(async () => {
    if (!gatewayUrl.startsWith('http')) {
      return;
    }
    try {
      const provider = await getProviderStatus(gatewayUrl);
      setProviderStatus(provider);
      setProviderModelDraft(provider.model ?? '');
      await refreshLocalBackends();
      await refreshModels();
      await refreshHfModels();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [gatewayUrl, refreshLocalBackends, refreshModels, refreshHfModels]);

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
        const provider = await updateProviderConfig(gatewayUrl, patch);
        setProviderStatus(provider);
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
      const passphrase = backupPassphrase.trim();
      const createOpts: {
        label?: string;
        workspaceIds?: string[];
        passphrase?: string;
      } = {
        label: backupLabel.trim() || undefined,
        workspaceIds: workspace ? [workspace.id] : undefined,
      };
      if (passphrase.length >= 8) {
        createOpts.passphrase = passphrase;
      }
      await createBackup(gatewayUrl, createOpts);
      await refreshBackups();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [backupLabel, backupPassphrase, gatewayUrl, refreshBackups, workspace]);

  const onRestoreBackup = useCallback(
    async (id: string, encrypted: boolean) => {
      if (!gatewayUrl.startsWith('http')) {
        return;
      }
      try {
        const passphrase = backupPassphrase.trim();
        if (encrypted && passphrase.length < 8) {
          setError('enter passphrase (≥8 chars) to restore encrypted backup');
          return;
        }
        const restoreOpts: { passphrase?: string } = {};
        if (encrypted && passphrase) {
          restoreOpts.passphrase = passphrase;
        }
        const result = await restoreBackup(gatewayUrl, id, restoreOpts);
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
    [backupPassphrase, gatewayUrl, refreshBackups]
  );

  const onCreateChannel = useCallback(async () => {
    if (!workspace || !gatewayUrl.startsWith('http')) {
      return;
    }
    if (channelKind === 'telegram' && channelBotToken.trim().length === 0) {
      setError('telegram bot token required');
      return;
    }
    try {
      await createChannel(gatewayUrl, workspace.id, {
        kind: channelKind,
        name:
          channelName.trim() ||
          (channelKind === 'telegram' ? 'telegram' : 'webhook'),
        ...(channelKind === 'telegram'
          ? { config: { botToken: channelBotToken.trim() } }
          : {}),
      });
      setChannelBotToken('');
      await refreshChannels();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [
    channelBotToken,
    channelKind,
    channelName,
    gatewayUrl,
    refreshChannels,
    workspace,
  ]);

  const onRemoveChannel = useCallback(
    async (channelId: string) => {
      if (!gatewayUrl.startsWith('http')) {
        return;
      }
      try {
        await deleteChannel(gatewayUrl, channelId);
        await refreshChannels();
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [gatewayUrl, refreshChannels]
  );

  const onTestChannel = useCallback(
    async (ch: ChannelPublic) => {
      if (!gatewayUrl.startsWith('http')) {
        return;
      }
      try {
        if (ch.kind === 'webhook') {
          await postChannelWebhook(gatewayUrl, ch.id, {
            externalUserId: 'desktop-test',
            text: 'ctrl channel test',
            displayName: 'Desktop',
          });
        } else {
          const recipient = channelTestRecipient.trim();
          if (!recipient) {
            setError('enter a test recipient (Telegram chat id) first');
            return;
          }
          await sendChannelMessage(gatewayUrl, ch.id, {
            externalUserId: recipient,
            text: 'ctrl channel test',
          });
        }
        setError(null);
        setToolStatus(`channel test ok · ${ch.name}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [channelTestRecipient, gatewayUrl]
  );

  const onSaveBinPath = useCallback(
    async (id: string) => {
      const path = (binPathDrafts[id] ?? '').trim();
      if (!path) {
        setError('binary path required');
        return;
      }
      try {
        await window.ctrlDesktop?.setLocalBackendBin(id, path);
        await refreshLocalBackends();
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [binPathDrafts, refreshLocalBackends]
  );

  const onBrowseBinPath = useCallback(
    async (id: string) => {
      try {
        const result = await window.ctrlDesktop?.pickLocalBackendBin(id);
        if (result?.ok && result.path) {
          setBinPathDrafts((prev) => ({ ...prev, [id]: result.path! }));
          await refreshLocalBackends();
          setError(null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [refreshLocalBackends]
  );

  const refreshKnowledge = useCallback(async () => {
    if (!workspace || !gatewayUrl.startsWith('http')) {
      return;
    }
    try {
      setMemoryItems(await listMemory(gatewayUrl, workspace.id));
      setEmbeddingStatus(
        await getEmbeddingStatus(gatewayUrl, workspace.id).catch(() => null)
      );
      if (knowledgeQuery.trim()) {
        setKnowledgeHits(
          await searchKnowledge(
            gatewayUrl,
            workspace.id,
            knowledgeQuery.trim(),
            undefined,
            knowledgeMode
          )
        );
      }
      const ctx = await inspectContext(gatewayUrl, workspace.id, {
        conversationId: conversation?.id,
        q: knowledgeQuery.trim() || undefined,
      });
      setContextPreview(ctx.assembledPreview);
      setContextTokenEstimate(ctx.tokenEstimate ?? null);
      setContextTokenEstimate(ctx.tokenEstimate ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [conversation, gatewayUrl, knowledgeMode, knowledgeQuery, workspace]);

  const onReindexKnowledge = useCallback(async () => {
    if (!workspace || !gatewayUrl.startsWith('http')) {
      return;
    }
    try {
      await reindexKnowledge(gatewayUrl, workspace.id);
      await refreshKnowledge();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [gatewayUrl, refreshKnowledge, workspace]);

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
            className={`ghost-btn${hostOpen ? ' ghost-btn-active' : ''}`}
            onClick={() => {
              togglePanel('host', () => {
                void refreshLocalBackends();
              });
            }}
          >
            host
          </button>
          <button
            type="button"
            className={`ghost-btn${knowledgeOpen ? ' ghost-btn-active' : ''}`}
            onClick={() => {
              togglePanel('knowledge', () => {
                void refreshKnowledge();
              });
            }}
          >
            knowledge
          </button>
          <button
            type="button"
            className={`ghost-btn${channelsOpen ? ' ghost-btn-active' : ''}`}
            onClick={() => {
              togglePanel('channels', () => {
                void refreshChannels();
              });
            }}
          >
            channels
          </button>
          <button
            type="button"
            className={`ghost-btn${providersOpen ? ' ghost-btn-active' : ''}`}
            onClick={() => {
              togglePanel('providers', () => {
                void refreshProviders();
              });
            }}
          >
            providers
          </button>
          <button
            type="button"
            className={`ghost-btn${toolsOpen ? ' ghost-btn-active' : ''}`}
            onClick={() => {
              togglePanel('tools', () => {
                void refreshTools();
              });
            }}
          >
            tools
          </button>
          <button
            type="button"
            className={`ghost-btn${backupsOpen ? ' ghost-btn-active' : ''}`}
            onClick={() => {
              togglePanel('backups', () => {
                void refreshBackups();
              });
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
        <aside className="host-panel host-panel-scroll">
          <section className="host-section">
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
            {updateLabel === 'disabled' ? (
              <p className="meta">updates disabled while running from source</p>
            ) : (
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
            )}
          </section>

          <section className="host-section">
            <p className="host-title">pairing token</p>
            <p className="meta">
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
          </section>

          <section className="host-section">
            <p className="host-title">openai key</p>
            <p className="meta">
              {hasOpenAiKey ? 'saved in safeStorage' : 'not set'}
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
          </section>
          <section className="host-section">
            <p className="host-title">phone pair</p>
            {gatewayToken ? (
              <>
                <PairQr
                  gatewayUrl={
                    lanUrls[0] ??
                    (gatewayUrl.startsWith('http')
                      ? gatewayUrl
                      : 'http://127.0.0.1:7331')
                  }
                  token={gatewayToken}
                />
                <div className="host-row">
                  <button
                    type="button"
                    className="ghost-btn"
                    disabled={
                      lanUrls.length === 0 && !gatewayUrl.startsWith('http')
                    }
                    onClick={() => {
                      const url =
                        lanUrls[0] ??
                        (gatewayUrl.startsWith('http') ? gatewayUrl : '');
                      if (url) {
                        void navigator.clipboard.writeText(url);
                      }
                    }}
                  >
                    copy LAN URL
                  </button>
                  <span className="meta">
                    {lanUrls[0] ??
                      '(no Wi‑Fi/Ethernet IP — phone cannot use 127.0.0.1)'}
                  </span>
                </div>
                {lanUrls.length === 0 ? (
                  <p className="meta warn">
                    No LAN IP detected — phone needs the PC Wi‑Fi/Ethernet
                    address. Windows firewall: allow inbound TCP on the gateway
                    port (usually 7331).
                  </p>
                ) : null}
              </>
            ) : (
              <p className="meta">
                pairing token required before QR is available
              </p>
            )}
          </section>

          <section className="host-section">
            <p className="host-title">local models</p>
            <p className="meta">
              Set your own binary paths (llama.cpp llama-server / litert-lm),
              then start. Prefer llama.cpp — not the Python uv llama-server.
            </p>
            <div className="host-row">
              <button
                type="button"
                className="ghost-btn"
                onClick={() => {
                  void refreshLocalBackends();
                }}
              >
                detect
              </button>
            </div>
            {localBackends.length === 0 ? (
              <p className="meta warn">
                Tap detect, or browse to a binary path below after detect fills
                rows.
              </p>
            ) : null}
            <ul className="host-card-list">
              {localBackends.map((b) => (
                <li key={b.id} className="host-card">
                  <div className="host-card-head">
                    <code>{b.id}</code>
                    <span className="meta">
                      :{b.port} · {b.running ? 'running' : 'stopped'}
                      {b.modelsPreview.length > 0
                        ? ` · ${b.modelsPreview.slice(0, 3).join(', ')}`
                        : ''}
                    </span>
                  </div>
                  <div className="host-row">
                    <input
                      className="host-input"
                      value={binPathDrafts[b.id] ?? b.binPath ?? ''}
                      onChange={(e) => {
                        const value = e.target.value;
                        setBinPathDrafts((prev) => ({
                          ...prev,
                          [b.id]: value,
                        }));
                      }}
                      placeholder={`path to ${b.id} binary`}
                      spellCheck={false}
                    />
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() => {
                        void onBrowseBinPath(b.id);
                      }}
                    >
                      browse
                    </button>
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() => {
                        void onSaveBinPath(b.id);
                      }}
                    >
                      save path
                    </button>
                  </div>
                  <div className="host-row">
                    <button
                      type="button"
                      className="ghost-btn"
                      disabled={!b.binFound || b.running}
                      onClick={() => {
                        void (async () => {
                          const row =
                            await window.ctrlDesktop?.startLocalBackend(b.id);
                          if (row) {
                            await refreshLocalBackends();
                            const active =
                              b.id === 'llama' ? 'llama' : 'litert';
                            await updateProviderConfig(gatewayUrl, {
                              active,
                              ...(b.id === 'llama'
                                ? { llama: { baseUrl: row.baseUrl } }
                                : { litert: { baseUrl: row.baseUrl } }),
                            });
                            await refreshProviders();
                          }
                        })();
                      }}
                    >
                      start
                    </button>
                    <button
                      type="button"
                      className="ghost-btn"
                      disabled={!b.running}
                      onClick={() => {
                        void (async () => {
                          await window.ctrlDesktop?.stopLocalBackend(b.id);
                          await refreshLocalBackends();
                        })();
                      }}
                    >
                      stop
                    </button>
                    <button
                      type="button"
                      className="ghost-btn"
                      disabled={!b.running}
                      onClick={() => {
                        void (async () => {
                          const active = b.id === 'llama' ? 'llama' : 'litert';
                          await updateProviderConfig(gatewayUrl, {
                            active,
                            ...(b.id === 'llama'
                              ? { llama: { baseUrl: b.baseUrl } }
                              : { litert: { baseUrl: b.baseUrl } }),
                          });
                          await refreshProviders();
                        })();
                      }}
                    >
                      use
                    </button>
                  </div>
                  {!b.binFound ? (
                    <p className="meta warn">{b.installHint}</p>
                  ) : null}
                  {b.error ? <p className="meta warn">{b.error}</p> : null}
                </li>
              ))}
            </ul>
            <p className="host-title">download binary</p>
            <div className="host-row">
              <select
                className="host-input host-input-narrow"
                value={binDownloadId}
                onChange={(e) =>
                  setBinDownloadId(
                    e.target.value === 'litert-lm' ? 'litert-lm' : 'llama'
                  )
                }
              >
                <option value="llama">llama</option>
                <option value="litert-lm">litert-lm</option>
              </select>
              <input
                className="host-input"
                value={binDownloadUrl}
                onChange={(e) => setBinDownloadUrl(e.target.value)}
                placeholder="binary download URL"
              />
              <button
                type="button"
                className="ghost-btn"
                disabled={!binDownloadUrl.trim()}
                onClick={() => {
                  void (async () => {
                    try {
                      setDownloadProgress({
                        id: binDownloadId,
                        downloaded: 0,
                      });
                      await window.ctrlDesktop?.downloadLocalBackendBin(
                        binDownloadId,
                        binDownloadUrl.trim()
                      );
                      await refreshLocalBackends();
                    } catch (err) {
                      setError(
                        err instanceof Error ? err.message : String(err)
                      );
                      setDownloadProgress(null);
                    }
                  })();
                }}
              >
                download
              </button>
            </div>
            {downloadProgress && downloadProgress.id === binDownloadId ? (
              <p className="meta">
                {downloadProgress.done
                  ? 'download done'
                  : downloadProgress.percent !== undefined
                    ? `${downloadProgress.percent}% (${Math.round(downloadProgress.downloaded / 1024 / 1024)} MB)`
                    : `${Math.round(downloadProgress.downloaded / 1024 / 1024)} MB downloaded`}
              </p>
            ) : null}
          </section>
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
          <p className="host-title">model browser</p>
          <p className="meta">
            Models from the active OpenAI-compatible endpoint
            {providerStatus?.active ? ` (${providerStatus.active})` : ''}.
          </p>
          <div className="host-row">
            <button
              type="button"
              className="ghost-btn"
              onClick={() => {
                void refreshModels();
              }}
            >
              refresh models
            </button>
          </div>
          <ul className="knowledge-list">
            {modelItems.length === 0 ? (
              <li className="meta">no models listed — start a local backend</li>
            ) : (
              modelItems.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() => {
                      void (async () => {
                        setProviderModelDraft(m.id);
                        const provider = await updateProviderConfig(
                          gatewayUrl,
                          { model: m.id }
                        );
                        setProviderStatus(provider);
                      })();
                    }}
                  >
                    {providerStatus?.model === m.id ? '●' : '○'}{' '}
                    {m.displayName ?? m.id}
                  </button>
                </li>
              ))
            )}
          </ul>
          <p className="meta">
            zen → opencode.ai/zen · kilo → ai-gateway.kilo.ai · llama → :8080 ·
            litert → litert-lm :9379 (PC) / on-device (phone)
          </p>

          <p className="host-title">HF model catalog</p>
          <p className="meta">
            Browse curated HuggingFace GGUF models for local use.
          </p>
          <div className="host-row">
            <button
              type="button"
              className="ghost-btn"
              onClick={() => {
                void refreshHfModels();
              }}
            >
              refresh catalog
            </button>
          </div>
          <ul className="knowledge-list">
            {hfModels.length === 0 ? (
              <li className="meta">no catalog entries</li>
            ) : (
              hfModels.map((m: HfModelCatalogEntry) => (
                <li key={m.id}>
                  <div>
                    <strong>{m.name}</strong>
                    <br />
                    <span className="meta">
                      {m.id}
                      {m.sizeGb ? ` · ${m.sizeGb} GB` : ''}
                      {(m.tags?.length ?? 0) > 0
                        ? ` · ${(m.tags ?? []).join(', ')}`
                        : ''}
                    </span>
                    <br />
                    <span className="meta">{m.description}</span>
                  </div>
                </li>
              ))
            )}
          </ul>
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
        <aside className="host-panel knowledge-panel host-panel-scroll">
          <section className="host-section">
            <p className="host-title">add channel</p>
            <p className="meta">
              webhook inbound · telegram long-poll · outbound send
            </p>
            <div className="host-row">
              <select
                className="host-input host-input-narrow"
                value={channelKind}
                onChange={(e) => {
                  const next =
                    e.target.value === 'telegram' ? 'telegram' : 'webhook';
                  setChannelKind(next);
                  setChannelName(next);
                }}
              >
                <option value="webhook">webhook</option>
                <option value="telegram">telegram</option>
              </select>
              <input
                className="host-input"
                value={channelName}
                onChange={(e) => setChannelName(e.target.value)}
                placeholder="channel name"
              />
            </div>
            {channelKind === 'telegram' ? (
              <div className="host-row">
                <input
                  className="host-input"
                  type="password"
                  value={channelBotToken}
                  onChange={(e) => setChannelBotToken(e.target.value)}
                  placeholder="bot token"
                  autoComplete="off"
                />
              </div>
            ) : null}
            <div className="host-row">
              <button
                type="button"
                className="demo-btn"
                onClick={() => {
                  void onCreateChannel();
                }}
                disabled={!workspace}
              >
                add {channelKind}
              </button>
            </div>
          </section>

          <section className="host-section">
            <p className="host-title">configured</p>
            <div className="host-row">
              <input
                className="host-input"
                value={channelTestRecipient}
                onChange={(e) => setChannelTestRecipient(e.target.value)}
                placeholder="test recipient (Telegram chat id)"
              />
            </div>
            <p className="meta">
              Test sends “ctrl channel test”. Webhook uses a desktop-test
              identity; Telegram needs a chat id above.
            </p>
            <ul className="host-card-list">
              {channelItems.map((ch) => (
                <li key={ch.id} className="host-card">
                  <div className="host-card-head">
                    <span>
                      <code>{ch.kind}</code> {ch.name}
                    </span>
                    <span className="meta">
                      {ch.status}
                      {ch.lastError ? ` · ${ch.lastError}` : ''}
                    </span>
                  </div>
                  <div className="host-row">
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() => {
                        void onTestChannel(ch);
                      }}
                    >
                      test
                    </button>
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() => {
                        void onRemoveChannel(ch.id);
                      }}
                    >
                      remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            {channelItems.length === 0 ? (
              <p className="meta">no channels yet</p>
            ) : null}
          </section>
        </aside>
      ) : null}

      {backupsOpen ? (
        <aside className="host-panel knowledge-panel">
          <p className="host-title">host backups</p>
          <p className="meta">
            Snapshots on this machine (`data/backups`). Optional passphrase (≥8)
            encrypts at rest (AES-256-GCM). Restore creates new workspaces.
          </p>
          <div className="host-row">
            <input
              className="host-input"
              value={backupLabel}
              onChange={(e) => setBackupLabel(e.target.value)}
              placeholder="label"
            />
            <input
              className="host-input"
              type="password"
              value={backupPassphrase}
              onChange={(e) => setBackupPassphrase(e.target.value)}
              placeholder="passphrase (optional)"
              autoComplete="new-password"
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
                ws · {b.encrypted ? 'encrypted · ' : ''}
                {new Date(b.createdAt).toLocaleString()}
                <div className="host-row">
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() => {
                      void onRestoreBackup(b.id, b.encrypted);
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
              placeholder="search query…"
            />
            <select
              className="host-input"
              value={knowledgeMode}
              onChange={(e) =>
                setKnowledgeMode(toKnowledgeSearchMode(e.target.value))
              }
            >
              <option value="hybrid">hybrid</option>
              <option value="vector">vector</option>
              <option value="fts">fts</option>
            </select>
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
          <div className="host-row">
            <span className="meta">
              {embeddingStatus
                ? embeddingStatus.enabled
                  ? `${embeddingStatus.provider}/${embeddingStatus.model} · ${embeddingStatus.indexedChunks}/${embeddingStatus.totalChunks} indexed`
                  : 'embeddings off (fts only)'
                : 'embeddings unknown'}
            </span>
            <button
              type="button"
              className="ghost-btn"
              onClick={() => {
                void onReindexKnowledge();
              }}
              disabled={!workspace || !embeddingStatus?.enabled}
            >
              reindex vectors
            </button>
          </div>
          {knowledgeHits.length > 0 ? (
            <ul className="knowledge-list">
              {knowledgeHits.map((hit) => (
                <li key={hit.chunkId}>
                  <code>{hit.filename}</code>{' '}
                  {hit.score !== undefined ? (
                    <span className="meta">
                      [{hit.source ?? 'hit'} {hit.score.toFixed(3)}]
                    </span>
                  ) : null}{' '}
                  — {hit.snippet}
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
              {contextTokenEstimate !== null ? (
                <p className="meta">
                  ~{contextTokenEstimate} tokens (estimate)
                </p>
              ) : null}
              {contextTokenEstimate !== null ? (
                <p className="meta">
                  ~{contextTokenEstimate} tokens (estimate)
                </p>
              ) : null}
              <pre className="context-preview">{contextPreview}</pre>
            </>
          ) : null}
        </aside>
      ) : null}

      {!firstRunDismissed ? (
        <section className="first-run">
          <p className="host-title">first run setup</p>
          <p className="meta">
            Windows firewall: allow TCP 7331 for gateway pairing. Local models:
            point CTRL_LLAMA_BIN at llama.cpp&apos;s llama-server (not the
            Python uv tool). litert-lm via CTRL_LITERT_LM_BIN is optional.
          </p>
          <button
            type="button"
            className="ghost-btn"
            onClick={() => {
              try {
                localStorage.setItem('ctrl.firstRunDismissed', '1');
              } catch {
                // ignore
              }
              setFirstRunDismissed(true);
            }}
          >
            dismiss
          </button>
        </section>
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
      {error ? (
        <div className="error-banner">
          <p className="error">{error}</p>
          <button
            type="button"
            className="ghost-btn"
            onClick={() => {
              void navigator.clipboard.writeText(error);
            }}
          >
            copy error
          </button>
        </div>
      ) : null}

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
