import { useFocusEffect, useRouter, type Href } from 'expo-router';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  checkHealth,
  createConversation,
  createWorkspace,
  listConversations,
  listWorkspaces,
  setClientAuth,
  type RunSession,
} from '@involvex/ctrl-i';
import {
  activePersona,
  buildSystemPrompt,
  loadAgentConfig,
  modeLabel,
  type AgentConfig,
} from '../src/agents/config';
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
  type BrainMessage,
  type BrainState,
} from '../src/brain/store';
import { syncBrainWithGateway } from '../src/brain/sync';
import { loadSavedConnection } from '../src/connection/storage';
import {
  generatorLabel,
  loadGeneratorMode,
  saveGeneratorMode,
  type GeneratorMode,
} from '../src/device/inference-mode';
import {
  useLitertEngine,
  type LitertEngineStatus,
} from '../src/device/use-litert-engine';
import {
  attachTextFileToChat,
  formatAttachmentDraft,
} from '../src/chat/attach-text';
import { isCancelledError, runProviderCascade } from '../src/providers/cascade';
import {
  enabledProviders,
  loadProviderStack,
  providerKindToGenerator,
  type ProviderStack,
} from '../src/providers/stack';
import {
  AppDrawer,
  GhostButton,
  PrimaryButton,
  colors,
  fonts,
} from '../src/ui';

type LitertGenerate = (prompt: string) => Promise<string>;

/** Mounts LiteRT without auto-load — cascade may fall back to phone. */
function LitertEngineHost({
  systemPrompt,
  onStatus,
  generateRef,
}: {
  systemPrompt: string;
  onStatus: (status: LitertEngineStatus) => void;
  generateRef: MutableRefObject<LitertGenerate | null>;
}) {
  const litert = useLitertEngine(systemPrompt);

  useEffect(() => {
    onStatus(litert.status);
  }, [litert.status, onStatus]);

  useEffect(() => {
    generateRef.current = litert.generate;
    return () => {
      generateRef.current = null;
    };
  }, [generateRef, litert.generate]);

  return null;
}

function deriveStatus(
  mode: GeneratorMode,
  hostOnline: boolean | null,
  litert: LitertEngineStatus | null,
  event: string | null
): string {
  if (event) {
    return event;
  }
  if (mode === 'litert') {
    if (litert?.unavailableReason) {
      return `On this phone · ${litert.unavailableReason}`;
    }
    if (litert?.ready) {
      return 'On this phone · model ready';
    }
    if (litert?.loadedOnce) {
      return 'On this phone · loading model…';
    }
    return 'On this phone · send to load model';
  }
  if (hostOnline === false) {
    return `${generatorLabel(mode)} · PC offline`;
  }
  if (hostOnline === true) {
    return `${generatorLabel(mode)} · host online`;
  }
  return `${generatorLabel(mode)} · checking host…`;
}

export default function ChatHomeScreen() {
  const router = useRouter();
  const [brain, setBrain] = useState<BrainState | null>(null);
  const [agent, setAgent] = useState<AgentConfig | null>(null);
  const [stack, setStack] = useState<ProviderStack | null>(null);
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState('');
  const [busy, setBusy] = useState(false);
  const [eventStatus, setEventStatus] = useState<string | null>(null);
  const [syncLine, setSyncLine] = useState('sync · idle');
  const [syncing, setSyncing] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [hostOnline, setHostOnline] = useState<boolean | null>(null);
  const [litertStatus, setLitertStatus] = useState<LitertEngineStatus | null>(
    null
  );
  const gatewayConversationIdRef = useRef<string | null>(null);
  const sessionRef = useRef<RunSession | null>(null);
  const brainRef = useRef<BrainState | null>(null);
  const syncingRef = useRef(false);
  const litertGenerateRef = useRef<LitertGenerate | null>(null);
  const cancelCascadeRef = useRef(false);

  const systemPrompt = useMemo(
    () => (agent ? buildSystemPrompt(agent) : 'You are ctrl.'),
    [agent]
  );

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
      if (gatewayConversationIdRef.current) {
        return gatewayConversationIdRef.current;
      }
      const workspaces = await listWorkspaces(baseUrl);
      let ws = workspaces[0] ?? null;
      if (!ws) {
        ws = await createWorkspace(baseUrl, 'Mobile');
      }
      const conversations = await listConversations(baseUrl, ws.id);
      let cv = conversations[0] ?? null;
      if (!cv) {
        cv = await createConversation(baseUrl, ws.id, 'Chat');
      }
      gatewayConversationIdRef.current = cv.id;
      return cv.id;
    },
    []
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
      const [loaded, mode, agentCfg, providers] = await Promise.all([
        loadBrain(),
        loadGeneratorMode(),
        loadAgentConfig(),
        loadProviderStack(),
      ]);
      if (cancelled) {
        return;
      }
      const aligned = setBrainGenerator(loaded, mode);
      brainRef.current = aligned;
      setBrain(aligned);
      setAgent(agentCfg);
      setStack(providers);
      await saveBrain(aligned);
      const conv = aligned.conversations.find(
        (c) => c.id === aligned.activeConversationId
      );
      gatewayConversationIdRef.current = conv?.gatewayConversationId ?? null;
      setEventStatus(null);
      await refreshHost();
    })();
    return () => {
      cancelled = true;
      sessionRef.current?.close();
    };
  }, [refreshHost]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void (async () => {
        const [agentCfg, providers, loaded] = await Promise.all([
          loadAgentConfig(),
          loadProviderStack(),
          loadBrain(),
        ]);
        if (!active) {
          return;
        }
        setAgent(agentCfg);
        setStack(providers);
        brainRef.current = loaded;
        setBrain(loaded);
        const conv = activeConversation(loaded);
        gatewayConversationIdRef.current = conv?.gatewayConversationId ?? null;
        const online = await refreshHost();
        if (!active || !online || !brainRef.current) {
          return;
        }
        await runSync();
      })();
      return () => {
        active = false;
      };
    }, [refreshHost, runSync])
  );

  const startNewChat = useCallback(() => {
    const current = brainRef.current;
    if (!current || busy) {
      return;
    }
    void (async () => {
      const next = createLocalConversation(current);
      gatewayConversationIdRef.current = null;
      await persist(next);
      setEventStatus('new chat');
      setStreaming('');
    })();
  }, [busy, persist]);

  const onLitertStatus = useCallback((next: LitertEngineStatus) => {
    setLitertStatus(next);
  }, []);

  const stop = useCallback(() => {
    cancelCascadeRef.current = true;
    const session = sessionRef.current;
    if (session) {
      try {
        session.cancel('user');
      } catch {
        try {
          session.close();
        } catch {
          // ignore
        }
      }
      sessionRef.current = null;
    }
    setStreaming('');
    setEventStatus('cancelled');
  }, []);

  const attachFile = useCallback(() => {
    if (busy) {
      return;
    }
    setEventStatus('picking file…');
    void (async () => {
      const result = await attachTextFileToChat({
        gatewayConversationId: gatewayConversationIdRef.current,
      });
      if (!result.ok) {
        if (result.error !== 'cancelled') {
          setEventStatus(result.error);
        } else {
          setEventStatus(null);
        }
        return;
      }
      const chunk = formatAttachmentDraft(result.filename, result.text);
      setDraft((prev) => (prev.trim() ? `${prev.trim()}\n\n${chunk}` : chunk));
      setEventStatus(result.message);
    })();
  }, [busy]);

  const send = useCallback(() => {
    const content = draft.trim();
    const current = brainRef.current;
    if (!current || busy || !content) {
      return;
    }
    setDraft('');
    setBusy(true);
    setStreaming('');
    setEventStatus(null);
    cancelCascadeRef.current = false;

    void (async () => {
      let next = appendLocalMessage(current, {
        role: 'user',
        content,
        origin: 'local',
      });
      next = maybeTitleFromFirstMessage(next, content);
      await persist(next);

      try {
        const providers = enabledProviders(
          stack ?? (await loadProviderStack())
        );
        if (providers.length === 0) {
          throw new Error('No providers enabled — open Providers in the menu.');
        }

        const saved = await refreshHost();
        const agentCfg = agent ?? (await loadAgentConfig());
        const result = await runProviderCascade(providers, content, {
          onStatus: (line) => {
            if (!cancelCascadeRef.current) {
              setEventStatus(line);
            }
          },
          onDelta: (text) => {
            if (!cancelCascadeRef.current) {
              setStreaming(text);
            }
          },
          litertGenerate: litertGenerateRef.current,
          litertUnavailable: litertStatus?.unavailableReason ?? null,
          ensureConversation: async (baseUrl) => {
            const id = await ensureGatewayConversation(baseUrl);
            next = setGatewayConversationId(brainRef.current ?? next, id);
            await persist(next);
            return id;
          },
          sessionRef,
          gatewayUrl: saved?.gatewayUrl ?? null,
          systemPrefix: buildSystemPrompt(agentCfg),
          isCancelled: () => cancelCascadeRef.current,
        });

        if (cancelCascadeRef.current) {
          setStreaming('');
          setEventStatus('cancelled');
          return;
        }

        const gen = providerKindToGenerator(
          providers.find((p) => p.id === result.providerId)?.kind ?? 'litert'
        );
        next = setBrainGenerator(brainRef.current ?? next, gen);
        await saveGeneratorMode(gen);
        next = appendLocalMessage(next, {
          role: 'assistant',
          content: result.text,
          origin: result.origin,
          provider: result.providerLabel,
        });
        await persist(next);
        setStreaming('');
        setEventStatus(`${result.providerLabel} · replied`);
        if (result.origin === 'gateway') {
          await runSync();
        }
      } catch (err: unknown) {
        setStreaming('');
        if (isCancelledError(err) || cancelCascadeRef.current) {
          setEventStatus('cancelled');
        } else {
          setEventStatus(err instanceof Error ? err.message : String(err));
        }
      } finally {
        setBusy(false);
      }
    })();
  }, [
    agent,
    busy,
    draft,
    ensureGatewayConversation,
    litertStatus,
    persist,
    refreshHost,
    runSync,
    stack,
  ]);

  const mode = brain?.generator ?? 'litert';
  const status = useMemo(
    () =>
      brain
        ? deriveStatus(brain.generator, hostOnline, litertStatus, eventStatus)
        : 'loading…',
    [brain, eventStatus, hostOnline, litertStatus]
  );

  if (!brain) {
    return (
      <SafeAreaView style={styles.root}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  const messages = listActiveMessages(brain);
  const personaName = agent ? activePersona(agent).name : '…';
  const modeChip = agent ? modeLabel(agent.mode) : 'Ask';

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />
      <LitertEngineHost
        key={
          agent
            ? `${agent.mode}:${agent.activePersonaId}:${agent.rules.length}`
            : 'default'
        }
        systemPrompt={systemPrompt}
        onStatus={onLitertStatus}
        generateRef={litertGenerateRef}
      />
      <AppDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      <View style={styles.top}>
        <GhostButton
          label="☰"
          onPress={() => setDrawerOpen(true)}
          style={styles.topBtn}
        />
        <Text style={styles.title} numberOfLines={1}>
          {activeConversation(brain)?.title ?? 'chat'}
        </Text>
        <View style={styles.topRight}>
          <GhostButton
            label="new"
            onPress={startNewChat}
            style={styles.topBtn}
          />
          <GhostButton
            label={syncing ? 'sync…' : 'sync'}
            onPress={() => {
              void runSync();
            }}
            style={styles.topBtn}
          />
        </View>
      </View>

      <View style={styles.modeRow}>
        <Pressable
          style={styles.chip}
          onPress={() => {
            router.push('/providers' as Href);
          }}
          accessibilityRole="button"
        >
          <Text style={styles.chipText}>
            cascade · {generatorLabel(mode)} ▾
          </Text>
        </Pressable>
        <Pressable
          style={styles.chip}
          onPress={() => {
            router.push('/agents' as Href);
          }}
          accessibilityRole="button"
        >
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
            {item.provider ? (
              <Text style={styles.providerTag}>{item.provider}</Text>
            ) : null}
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
            Local-first chat. Menu → Providers sets cascade order. Agents sets
            Ask / Plan / Auto.
          </Text>
        }
      />

      <View style={styles.composer}>
        <GhostButton
          label="file"
          onPress={attachFile}
          disabled={busy}
          style={styles.attach}
        />
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="message…"
          placeholderTextColor={colors.muted}
          editable={!busy}
          onSubmitEditing={send}
        />
        {busy ? (
          <GhostButton label="stop" onPress={stop} style={styles.send} />
        ) : (
          <PrimaryButton label="send" onPress={send} style={styles.send} />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 8,
    gap: 8,
  },
  topBtn: { paddingHorizontal: 10, paddingVertical: 8 },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  title: {
    flex: 1,
    color: colors.accent,
    fontFamily: fonts.mono,
    fontWeight: '700',
    fontSize: 16,
    textAlign: 'center',
  },
  modeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginTop: 8,
    gap: 8,
    flexWrap: 'wrap',
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: 'rgba(0, 255, 102, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipText: {
    color: colors.accent,
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '700',
  },
  hostChip: {
    borderWidth: 1,
    borderColor: colors.charcoal,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  hostOnline: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(0, 255, 102, 0.08)',
  },
  hostOffline: { borderColor: colors.danger },
  hostChipText: {
    color: colors.muted,
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '700',
  },
  meta: {
    color: colors.muted,
    fontFamily: fonts.mono,
    fontSize: 11,
    paddingHorizontal: 16,
    marginVertical: 4,
  },
  list: { flex: 1, paddingHorizontal: 16 },
  bubble: {
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.charcoal,
  },
  user: { backgroundColor: '#14201a', alignSelf: 'flex-end', maxWidth: '88%' },
  assistant: {
    backgroundColor: colors.panel,
    alignSelf: 'flex-start',
    maxWidth: '92%',
  },
  providerTag: {
    color: colors.muted,
    fontFamily: fonts.mono,
    fontSize: 10,
    marginBottom: 4,
  },
  bubbleText: { color: colors.accent, fontFamily: fonts.mono, fontSize: 13 },
  composer: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: colors.charcoal,
    alignItems: 'stretch',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.accent,
    color: colors.accent,
    fontFamily: fonts.mono,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.field,
  },
  send: { paddingHorizontal: 16, justifyContent: 'center' },
  attach: { paddingHorizontal: 10, justifyContent: 'center' },
});
