import { useRouter, type Href } from 'expo-router';
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
  streamChat,
  updateProviderConfig,
  type RunSession,
} from '@involvex/ctrl-i';
import {
  generatorLabel,
  loadGeneratorMode,
  saveGeneratorMode,
  type WebGeneratorMode,
} from '../src/brain/generator';
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

const GENERATORS: WebGeneratorMode[] = ['gateway', 'zen'];

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
        ws = await createWorkspace(baseUrl, 'Web');
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
      const online = await refreshHost();
      if (!cancelled && online && brainRef.current) {
        await runSync();
      }
    })();
    return () => {
      cancelled = true;
      sessionRef.current?.close();
    };
  }, [refreshHost, runSync]);

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
  }, [busy, draft, ensureGatewayConversation, persist, refreshHost, runSync]);

  if (!brain) {
    return (
      <View style={styles.root}>
        <ActivityIndicator color="#00ff66" />
      </View>
    );
  }

  const messages = listActiveMessages(brain);
  const mode = brain.generator;

  return (
    <View style={styles.root}>
      <View style={styles.top}>
        <Pressable
          onPress={() => {
            router.back();
          }}
        >
          <Text style={styles.link}>← back</Text>
        </Pressable>
        <Text style={styles.title}>chat</Text>
        <Pressable
          onPress={() => {
            void runSync();
          }}
        >
          <Text style={styles.link}>{syncing ? 'sync…' : 'sync'}</Text>
        </Pressable>
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
            router.push('/settings' as Href);
          }}
        >
          <Text style={styles.link}>providers</Text>
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
  top: { flexDirection: 'row', justifyContent: 'space-between' },
  title: {
    color: '#00ff66',
    fontFamily: 'monospace',
    fontSize: 18,
    fontWeight: '700',
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
});
