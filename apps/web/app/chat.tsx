import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  checkHealth,
  createConversation,
  createWorkspace,
  listConversations,
  listWorkspaces,
  setClientAuth,
  streamApprovals,
  streamChat,
  updateProviderConfig,
  type ApprovalSession,
  type RunSession,
} from '@involvex/ctrl-i';
import type { ToolCall } from '@involvex/ctrl-s';
import {
  generatorLabel,
  loadGeneratorMode,
  saveGeneratorMode,
  type WebGeneratorMode,
} from '../src/brain/generator';
import {
  activeConversation,
  appendLocalMessage,
  createLocalConversation,
  listActiveMessages,
  loadBrain,
  maybeTitleFromFirstMessage,
  saveBrain,
  setBrainGenerator,
  setGatewayConversationId,
  setGatewayWorkspaceId,
  type BrainMessage,
  type BrainState,
} from '../src/brain/store';
import { syncBrainWithGateway } from '../src/brain/sync';
import { loadSavedConnection } from '../src/connection/storage';
import {
  activePersona,
  loadAgentConfig,
  modeLabel,
  type AgentConfig,
} from '../src/agents/config';
import { AppDrawer } from '../src/ui/AppDrawer';

const GENERATORS: WebGeneratorMode[] = ['gateway', 'zen'];

type PendingApproval = {
  approvalId: string;
  call: ToolCall;
  risk: 'low' | 'high';
  timeoutMs: number;
  source?: 'chat' | 'channel';
  channelId?: string;
};

export default function ChatScreen() {
  const router = useRouter();
  const [brain, setBrain] = useState<BrainState | null>(null);
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('loading…');
  const [syncLine, setSyncLine] = useState('sync · idle');
  const [syncing, setSyncing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [hostOnline, setHostOnline] = useState<boolean | null>(null);
  const [pendingApproval, setPendingApproval] =
    useState<PendingApproval | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [agent, setAgent] = useState<AgentConfig | null>(null);
  const gatewayConversationIdRef = useRef<string | null>(null);
  const gatewayWorkspaceIdRef = useRef<string | null>(null);
  const sessionRef = useRef<RunSession | null>(null);
  const approvalsSessionRef = useRef<ApprovalSession | null>(null);
  const brainRef = useRef<BrainState | null>(null);
  const syncingRef = useRef(false);

  const persist = useCallback(async (next: BrainState) => {
    brainRef.current = next;
    setBrain(next);
    await saveBrain(next);
  }, []);

  const refreshHost = useCallback(async () => {
    const saved = await loadSavedConnection();
    if (!saved) {
      setHostOnline(false);
      gatewayConversationIdRef.current = null;
      return null;
    }
    setClientAuth({ token: saved.token || undefined });
    try {
      await checkHealth(saved.gatewayUrl);
      setHostOnline(true);
      return saved;
    } catch {
      setHostOnline(false);
      return null;
    }
  }, []);

  const ensureGatewayConversation = useCallback(
    async (baseUrl: string): Promise<string> => {
      const current = brainRef.current;
      const localConv = current ? activeConversation(current) : undefined;
      const pinnedWs = current?.gatewayWorkspaceId;
      const pinnedConv = localConv?.gatewayConversationId;

      if (
        pinnedConv &&
        pinnedWs &&
        gatewayConversationIdRef.current === pinnedConv &&
        gatewayWorkspaceIdRef.current === pinnedWs
      ) {
        return pinnedConv;
      }

      const workspaces = await listWorkspaces(baseUrl);
      let ws =
        (pinnedWs ? workspaces.find((w) => w.id === pinnedWs) : undefined) ??
        workspaces.find((w) => w.name === 'Web') ??
        workspaces[0] ??
        null;
      if (!ws) {
        ws = await createWorkspace(baseUrl, 'Web');
      }
      gatewayWorkspaceIdRef.current = ws.id;

      if (pinnedConv) {
        const conversations = await listConversations(baseUrl, ws.id);
        const existing = conversations.find((c) => c.id === pinnedConv);
        if (existing) {
          gatewayConversationIdRef.current = existing.id;
          return existing.id;
        }
      }

      // Never fall back to conversations[0] — bind this local thread to its own host chat.
      const cv = await createConversation(
        baseUrl,
        ws.id,
        localConv?.title?.trim() || 'Chat'
      );
      gatewayConversationIdRef.current = cv.id;
      return cv.id;
    },
    []
  );

  const attachApprovalsListener = useCallback(
    async (baseUrl: string) => {
      try {
        await ensureGatewayConversation(baseUrl);
        const workspaceId = gatewayWorkspaceIdRef.current;
        if (!workspaceId) {
          return;
        }
        approvalsSessionRef.current?.close();
        approvalsSessionRef.current = streamApprovals(baseUrl, workspaceId, {
          onEvent: (event) => {
            if (
              event.type === 'approval.requested' &&
              event.source === 'channel'
            ) {
              setPendingApproval({
                approvalId: event.approvalId,
                call: event.call,
                risk: event.risk,
                timeoutMs: event.timeoutMs,
                source: 'channel',
                ...(event.channelId ? { channelId: event.channelId } : {}),
              });
              setStatus(
                `approve channel tool · ${event.call.name}${
                  event.channelId ? ` · ${event.channelId}` : ''
                }`
              );
            }
            if (
              event.type === 'approval.resolved' &&
              event.source === 'channel'
            ) {
              setPendingApproval((prev) =>
                prev?.approvalId === event.approvalId ? null : prev
              );
            }
          },
        });
      } catch {
        // host may be offline
      }
    },
    [ensureGatewayConversation]
  );

  const runSync = useCallback(async () => {
    const current = brainRef.current;
    if (!current || syncingRef.current) {
      return;
    }
    syncingRef.current = true;
    setSyncing(true);
    setSyncLine('sync · running…');
    try {
      const result = await syncBrainWithGateway(current);
      if (result.ok) {
        brainRef.current = result.brain;
        setBrain(result.brain);
        if (result.brain.gatewayWorkspaceId) {
          gatewayWorkspaceIdRef.current = result.brain.gatewayWorkspaceId;
        }
        const conv = result.brain.conversations.find(
          (c) => c.id === result.brain.activeConversationId
        );
        if (conv?.gatewayConversationId) {
          gatewayConversationIdRef.current = conv.gatewayConversationId;
        }
        setHostOnline(true);
        setSyncLine(
          `sync · ok · +${result.pulled} pulled · +${result.pushed} pushed`
        );
      } else {
        setHostOnline(false);
        setSyncLine(`sync · skipped · ${result.reason}`);
      }
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [loaded, mode, agentCfg] = await Promise.all([
        loadBrain(),
        loadGeneratorMode(),
        loadAgentConfig(),
      ]);
      if (cancelled) {
        return;
      }
      const aligned = setBrainGenerator(loaded, mode);
      brainRef.current = aligned;
      setBrain(aligned);
      setAgent(agentCfg);
      await saveBrain(aligned);
      const conv = aligned.conversations.find(
        (c) => c.id === aligned.activeConversationId
      );
      if (conv?.gatewayConversationId) {
        gatewayConversationIdRef.current = conv.gatewayConversationId;
      }
      setStatus(`${generatorLabel(aligned.generator)} · local brain`);
      const online = await refreshHost();
      if (!cancelled && online && brainRef.current) {
        await runSync();
        await attachApprovalsListener(online.gatewayUrl);
      }
    })();
    return () => {
      cancelled = true;
      sessionRef.current?.close();
      approvalsSessionRef.current?.close();
    };
  }, [attachApprovalsListener, refreshHost, runSync]);

  const selectGenerator = useCallback(
    async (mode: WebGeneratorMode) => {
      setPickerOpen(false);
      const current = brainRef.current;
      if (!current) {
        return;
      }
      const next = setBrainGenerator(current, mode);
      await persist(next);
      await saveGeneratorMode(mode);

      const saved = await refreshHost();
      if (!saved) {
        setStatus(
          `${generatorLabel(mode)} · PC offline — transcript stays local`
        );
        return;
      }
      if (mode === 'zen') {
        try {
          await updateProviderConfig(saved.gatewayUrl, { active: 'zen' });
        } catch (err) {
          setStatus(
            `Cloud · ${err instanceof Error ? err.message : String(err)}`
          );
          return;
        }
      }
      setStatus(`${generatorLabel(mode)} · host online`);
    },
    [persist, refreshHost]
  );

  const decideApproval = useCallback(
    (decision: 'approved' | 'denied') => {
      if (!pendingApproval) {
        return;
      }
      if (pendingApproval.source === 'channel') {
        approvalsSessionRef.current?.resolveApproval(
          pendingApproval.approvalId,
          decision
        );
      } else if (sessionRef.current) {
        sessionRef.current.resolveApproval(
          pendingApproval.approvalId,
          decision
        );
      } else {
        approvalsSessionRef.current?.resolveApproval(
          pendingApproval.approvalId,
          decision
        );
      }
      setPendingApproval(null);
    },
    [pendingApproval]
  );

  const send = useCallback(() => {
    const content = draft.trim();
    const current = brainRef.current;
    if (!current || busy || !content) {
      return;
    }
    setDraft('');
    setBusy(true);
    setStreaming('');
    setPendingApproval(null);

    void (async () => {
      let next = appendLocalMessage(current, {
        role: 'user',
        content,
        origin: 'local',
      });
      next = maybeTitleFromFirstMessage(next, content);
      await persist(next);

      const mode = next.generator;
      const saved = await refreshHost();
      if (!saved) {
        setStatus(`${generatorLabel(mode)} · PC offline`);
        setBusy(false);
        return;
      }

      try {
        if (mode === 'zen') {
          await updateProviderConfig(saved.gatewayUrl, { active: 'zen' });
        }
        const conversationId = await ensureGatewayConversation(
          saved.gatewayUrl
        );
        let mapped = setGatewayConversationId(
          brainRef.current ?? next,
          conversationId
        );
        if (gatewayWorkspaceIdRef.current) {
          mapped = setGatewayWorkspaceId(mapped, gatewayWorkspaceIdRef.current);
        }
        next = mapped;
        await persist(next);

        let assembled = '';
        sessionRef.current?.close();
        sessionRef.current = streamChat(
          saved.gatewayUrl,
          conversationId,
          content,
          {
            onEvent: (event) => {
              if (event.type === 'message.delta') {
                assembled += event.text;
                setStreaming(assembled);
              }
              if (event.type === 'approval.requested') {
                setPendingApproval({
                  approvalId: event.approvalId,
                  call: event.call,
                  risk: event.risk,
                  timeoutMs: event.timeoutMs,
                });
                setStatus(`approve tool · ${event.call.name}`);
              }
              if (event.type === 'approval.resolved') {
                setPendingApproval(null);
              }
              if (event.type === 'run.completed') {
                setBusy(false);
                setPendingApproval(null);
                void (async () => {
                  const base = brainRef.current ?? next;
                  const withAssistant = appendLocalMessage(base, {
                    role: 'assistant',
                    content: assembled || '(empty reply)',
                    origin: 'gateway',
                  });
                  await persist(withAssistant);
                  setStreaming('');
                  setStatus(`${generatorLabel(mode)} · replied`);
                  await runSync();
                })();
              }
              if (event.type === 'run.failed') {
                setBusy(false);
                setPendingApproval(null);
                setStatus(event.error.message);
                setStreaming('');
              }
              if (event.type === 'run.cancelled') {
                setBusy(false);
                setPendingApproval(null);
                setStatus(event.reason ?? 'cancelled');
                setStreaming('');
              }
            },
            onError: (err) => {
              setBusy(false);
              setPendingApproval(null);
              setStatus(err.message);
            },
          }
        );
      } catch (err) {
        setBusy(false);
        setPendingApproval(null);
        setStatus(err instanceof Error ? err.message : String(err));
      }
    })();
  }, [busy, draft, ensureGatewayConversation, persist, refreshHost, runSync]);

  const startNewChat = useCallback(() => {
    const current = brainRef.current;
    if (!current || busy) {
      return;
    }
    void (async () => {
      gatewayConversationIdRef.current = null;
      const next = createLocalConversation(current);
      await persist(next);
      setStatus('new chat');
      setStreaming('');
    })();
  }, [busy, persist]);

  if (!brain) {
    return (
      <View style={styles.root}>
        <ActivityIndicator color="#00ff66" />
      </View>
    );
  }

  const messages = listActiveMessages(brain);
  const mode = brain.generator;
  const personaName = agent ? activePersona(agent).name : '…';
  const modeChip = agent ? modeLabel(agent.mode) : 'Ask';

  return (
    <View style={styles.root}>
      <AppDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <View style={styles.top}>
        <Pressable onPress={() => setDrawerOpen(true)}>
          <Text style={styles.link}>☰</Text>
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {activeConversation(brain)?.title ?? 'chat'}
        </Text>
        <View style={styles.topRight}>
          <Pressable onPress={startNewChat} disabled={busy}>
            <Text style={styles.link}>new</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              void runSync();
            }}
          >
            <Text style={styles.link}>{syncing ? 'sync…' : 'sync'}</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.modeRow}>
        <Pressable
          style={styles.chip}
          onPress={() => {
            setPickerOpen(true);
          }}
        >
          <Text style={styles.chipText}>
            generator · {generatorLabel(mode)} ▾
          </Text>
        </Pressable>
        <Pressable style={styles.chip} onPress={() => router.push('/agents')}>
          <Text style={styles.chipText}>
            {modeChip} · {personaName}
          </Text>
        </Pressable>
        <View
          style={[
            styles.hostChip,
            hostOnline === true
              ? styles.hostOnline
              : hostOnline === false
                ? styles.hostOffline
                : null,
          ]}
        >
          <Text style={styles.hostChipText}>
            {hostOnline === true
              ? 'PC online'
              : hostOnline === false
                ? 'PC offline'
                : 'PC …'}
          </Text>
        </View>
        <Pressable
          onPress={() => {
            router.push('/conversations');
          }}
        >
          <Text style={styles.link}>threads</Text>
        </Pressable>
      </View>

      <Text style={styles.meta}>{status}</Text>
      <Text style={styles.meta}>{syncLine}</Text>

      <FlatList
        style={styles.list}
        data={messages}
        keyExtractor={(item: BrainMessage) => item.id}
        renderItem={({ item }) => (
          <View
            style={[
              styles.bubble,
              item.role === 'user' ? styles.user : styles.assistant,
            ]}
          >
            <Text style={styles.bubbleText}>{item.content}</Text>
          </View>
        )}
        ListFooterComponent={
          streaming ? (
            <View style={[styles.bubble, styles.assistant]}>
              <Text style={styles.bubbleText}>{streaming}</Text>
            </View>
          ) : undefined
        }
        ListEmptyComponent={
          <Text style={styles.meta}>
            Local transcript — works with the PC offline. Sync when home.
          </Text>
        }
      />

      {pendingApproval ? (
        <View style={styles.approval}>
          <Text style={styles.approvalTitle}>
            approve tool {pendingApproval.call.name} [{pendingApproval.risk}]
            {pendingApproval.source === 'channel'
              ? ` · channel${pendingApproval.channelId ? ` ${pendingApproval.channelId}` : ''}`
              : ''}
          </Text>
          <Text style={styles.approvalArgs}>
            {JSON.stringify(pendingApproval.call.arguments, null, 2)}
          </Text>
          <View style={styles.approvalActions}>
            <Pressable
              style={styles.approveBtn}
              onPress={() => decideApproval('approved')}
            >
              <Text style={styles.approveText}>approve</Text>
            </Pressable>
            <Pressable
              style={styles.denyBtn}
              onPress={() => decideApproval('denied')}
            >
              <Text style={styles.denyText}>deny</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="message…"
          placeholderTextColor="#6b7f72"
          editable={!busy}
          onSubmitEditing={send}
        />
        <Pressable
          style={[styles.send, busy && styles.sendDisabled]}
          onPress={send}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.sendText}>send</Text>
          )}
        </Pressable>
      </View>

      <Modal
        visible={pickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setPickerOpen(false);
        }}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => {
            setPickerOpen(false);
          }}
        >
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Generator</Text>
            {GENERATORS.map((g) => (
              <Pressable
                key={g}
                style={[
                  styles.sheetRow,
                  g === mode ? styles.sheetRowActive : null,
                ]}
                onPress={() => {
                  void selectGenerator(g);
                }}
              >
                <Text style={styles.sheetRowTitle}>{generatorLabel(g)}</Text>
                <Text style={styles.meta}>
                  {g === 'gateway'
                    ? hostOnline === false
                      ? 'PC offline'
                      : 'Paired host agent'
                    : hostOnline === false
                      ? 'PC offline (cloud via host)'
                      : 'Zen / cloud via host'}
                </Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000', padding: 16, gap: 8 },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  topRight: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  title: {
    flex: 1,
    color: '#00ff66',
    fontFamily: 'monospace',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  link: { color: '#00ff66', fontFamily: 'monospace' },
  modeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  chip: {
    borderWidth: 1,
    borderColor: '#00ff66',
    backgroundColor: 'rgba(0, 255, 102, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipText: {
    color: '#00ff66',
    fontFamily: 'monospace',
    fontSize: 11,
    fontWeight: '700',
  },
  hostChip: {
    borderWidth: 1,
    borderColor: '#1f3328',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  hostOnline: {
    borderColor: '#00ff66',
    backgroundColor: 'rgba(0, 255, 102, 0.08)',
  },
  hostOffline: { borderColor: '#ff6666' },
  hostChipText: {
    color: '#6b7f72',
    fontFamily: 'monospace',
    fontSize: 11,
    fontWeight: '700',
  },
  meta: { color: '#6b7f72', fontFamily: 'monospace', fontSize: 12 },
  list: { flex: 1 },
  bubble: { padding: 10, marginVertical: 4, maxWidth: '90%' },
  user: { alignSelf: 'flex-end', backgroundColor: '#1f3328' },
  assistant: { alignSelf: 'flex-start', backgroundColor: '#0a0f0c' },
  bubbleText: { color: '#00ff66', fontFamily: 'monospace', fontSize: 13 },
  composer: { flexDirection: 'row', gap: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#00ff66',
    color: '#00ff66',
    fontFamily: 'monospace',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#111613',
  },
  send: {
    backgroundColor: '#00ff66',
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  sendDisabled: { opacity: 0.5 },
  sendText: { color: '#000', fontFamily: 'monospace', fontWeight: '700' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#0a0f0c',
    borderTopWidth: 1,
    borderColor: '#00ff66',
    padding: 20,
    gap: 10,
  },
  sheetTitle: {
    color: '#00ff66',
    fontFamily: 'monospace',
    fontWeight: '700',
    fontSize: 16,
  },
  sheetRow: {
    borderWidth: 1,
    borderColor: '#1f3328',
    padding: 12,
    gap: 4,
  },
  sheetRowActive: { borderColor: '#00ff66' },
  sheetRowTitle: {
    color: '#00ff66',
    fontFamily: 'monospace',
    fontWeight: '700',
  },
  approval: {
    borderWidth: 1,
    borderColor: '#00ff66',
    backgroundColor: '#0a0f0c',
    padding: 12,
    gap: 8,
  },
  approvalTitle: {
    color: '#00ff66',
    fontFamily: 'monospace',
    fontSize: 12,
    fontWeight: '700',
  },
  approvalArgs: {
    color: '#6b7f72',
    fontFamily: 'monospace',
    fontSize: 11,
  },
  approvalActions: { flexDirection: 'row', gap: 8 },
  approveBtn: {
    backgroundColor: '#00ff66',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  approveText: {
    color: '#000',
    fontFamily: 'monospace',
    fontWeight: '700',
  },
  denyBtn: {
    borderWidth: 1,
    borderColor: '#00ff66',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  denyText: {
    color: '#00ff66',
    fontFamily: 'monospace',
    fontWeight: '700',
  },
});
