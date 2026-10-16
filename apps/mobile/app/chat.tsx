import { useFocusEffect, useRouter, type Href } from 'expo-router';
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
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  checkHealth,
  createConversation,
  createWorkspace,
  listConversations,
  listWorkspaces,
  setClientAuth,
  streamChat,
  updateProviderConfig,
  type RunSession,
} from '@involvex/ctrl-i';
import {
  appendLocalMessage,
  listActiveMessages,
  loadBrain,
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
import { useLitertEngine } from '../src/device/use-litert-engine';
import { GhostButton, PrimaryButton, colors, fonts } from '../src/ui';

const GENERATORS: GeneratorMode[] = ['litert', 'gateway', 'zen'];

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
  const gatewayConversationIdRef = useRef<string | null>(null);
  const sessionRef = useRef<RunSession | null>(null);
  const brainRef = useRef<BrainState | null>(null);

  const litert = useLitertEngine(brain?.persona ?? 'You are ctrl. Be concise.');

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
    if (!current || syncing) {
      return;
    }
    setSyncing(true);
    setSyncLine('sync · running…');
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
    setSyncing(false);
  }, [syncing]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [loaded, mode] = await Promise.all([
        loadBrain(),
        loadGeneratorMode(),
      ]);
      if (cancelled) {
        return;
      }
      const aligned = setBrainGenerator(loaded, mode);
      brainRef.current = aligned;
      setBrain(aligned);
      await saveBrain(aligned);
      const conv = aligned.conversations.find(
        (c) => c.id === aligned.activeConversationId
      );
      if (conv?.gatewayConversationId) {
        gatewayConversationIdRef.current = conv.gatewayConversationId;
      }
      setStatus(`${generatorLabel(aligned.generator)} · local brain`);
      await refreshHost();
    })();
    return () => {
      cancelled = true;
      sessionRef.current?.close();
    };
  }, [refreshHost]);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        const online = await refreshHost();
        if (online && brainRef.current) {
          await runSync();
        }
      })();
    }, [refreshHost, runSync])
  );

  const selectGenerator = useCallback(
    async (mode: GeneratorMode) => {
      setPickerOpen(false);
      const current = brainRef.current;
      if (!current) {
        return;
      }
      const next = setBrainGenerator(current, mode);
      await persist(next);
      await saveGeneratorMode(mode);

      if (mode === 'litert') {
        if (litert.status.unavailableReason) {
          setStatus(`On this phone · ${litert.status.unavailableReason}`);
        } else {
          setStatus('On this phone · ready');
        }
        return;
      }

      const saved = await refreshHost();
      if (!saved) {
        setStatus(
          `${generatorLabel(mode)} · PC offline — chat stays local; Sync when home`
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
    [litert.status.unavailableReason, persist, refreshHost]
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

    void (async () => {
      let next = appendLocalMessage(current, {
        role: 'user',
        content,
        origin: 'local',
      });
      await persist(next);

      const mode = next.generator;

      if (mode === 'litert') {
        try {
          if (litert.status.unavailableReason) {
            throw new Error(litert.status.unavailableReason);
          }
          const reply = await litert.generate(content);
          next = appendLocalMessage(brainRef.current ?? next, {
            role: 'assistant',
            content: reply,
            origin: 'local',
          });
          await persist(next);
          setStatus('On this phone · replied');
        } catch (err) {
          setStatus(
            `On this phone · ${err instanceof Error ? err.message : String(err)}`
          );
        } finally {
          setBusy(false);
        }
        return;
      }

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
        next = setGatewayConversationId(
          brainRef.current ?? next,
          conversationId
        );
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
              if (event.type === 'run.completed') {
                setBusy(false);
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
                setStatus(event.error.message);
                setStreaming('');
              }
            },
            onError: (err) => {
              setBusy(false);
              setStatus(err.message);
            },
          }
        );
      } catch (err) {
        setBusy(false);
        setStatus(err instanceof Error ? err.message : String(err));
      }
    })();
  }, [
    busy,
    draft,
    ensureGatewayConversation,
    litert,
    persist,
    refreshHost,
    runSync,
  ]);

  if (!brain) {
    return (
      <SafeAreaView style={styles.root}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  const messages = listActiveMessages(brain);
  const mode = brain.generator;
  const hostHint =
    mode === 'litert'
      ? litert.status.unavailableReason
        ? litert.status.unavailableReason
        : litert.status.ready
          ? 'model ready'
          : 'model loading / setup needed'
      : hostOnline === false
        ? 'PC offline'
        : hostOnline === true
          ? 'PC online'
          : 'checking host…';

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />
      <View style={styles.top}>
        <GhostButton
          label="← back"
          onPress={() => {
            router.back();
          }}
          style={styles.topBtn}
        />
        <Text style={styles.title}>chat</Text>
        <GhostButton
          label={syncing ? 'sync…' : 'sync'}
          onPress={() => {
            void runSync();
          }}
          style={styles.topBtn}
        />
      </View>

      <View style={styles.modeRow}>
        <Pressable
          style={styles.chip}
          onPress={() => {
            setPickerOpen(true);
          }}
          accessibilityRole="button"
        >
          <Text style={styles.chipText}>
            generator · {generatorLabel(mode)} ▾
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
        <GhostButton
          label="settings"
          onPress={() => {
            router.push('/settings' as Href);
          }}
          style={styles.topBtn}
        />
      </View>

      <Text style={styles.meta}>{status}</Text>
      <Text style={styles.meta}>
        {syncLine} · {hostHint}
      </Text>

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
            Local transcript — works with the PC offline. Sync when you are
            home.
          </Text>
        }
      />

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="message…"
          placeholderTextColor={colors.muted}
          editable={!busy}
          onSubmitEditing={send}
        />
        <PrimaryButton
          label="send"
          onPress={send}
          busy={busy}
          disabled={busy}
          style={styles.send}
        />
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
                  {g === 'litert'
                    ? (litert.status.unavailableReason ??
                      'LiteRT on this phone')
                    : g === 'gateway'
                      ? hostOnline === false
                        ? 'PC offline'
                        : 'Paired host agent'
                      : hostOnline === false
                        ? 'PC offline (cloud via host)'
                        : 'Zen / cloud via host'}
                </Text>
                {g === 'litert' ? (
                  <Pressable
                    onPress={() => {
                      setPickerOpen(false);
                      router.push('/on-device' as Href);
                    }}
                  >
                    <Text style={styles.link}>Model setup →</Text>
                  </Pressable>
                ) : null}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
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
  title: {
    color: colors.accent,
    fontFamily: fonts.mono,
    fontWeight: '700',
    fontSize: 18,
  },
  modeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    marginVertical: 8,
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.panel,
    borderTopWidth: 1,
    borderColor: colors.accent,
    padding: 20,
    gap: 10,
  },
  sheetTitle: {
    color: colors.accent,
    fontFamily: fonts.mono,
    fontWeight: '700',
    fontSize: 16,
    marginBottom: 4,
  },
  sheetRow: {
    borderWidth: 1,
    borderColor: colors.charcoal,
    padding: 12,
    gap: 4,
  },
  sheetRowActive: { borderColor: colors.accent },
  sheetRowTitle: {
    color: colors.accent,
    fontFamily: fonts.mono,
    fontWeight: '700',
  },
  link: {
    color: colors.accent,
    fontFamily: fonts.mono,
    fontSize: 12,
    marginTop: 4,
    textDecorationLine: 'underline',
  },
});
