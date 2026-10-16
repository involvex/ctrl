import { useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  createConversation,
  createWorkspace,
  listConversations,
  listMessages,
  listWorkspaces,
  setClientAuth,
  streamChat,
  type Message,
  type RunSession,
} from '@involvex/ctrl-i';
import { loadSavedConnection } from '../src/connection/storage';
import { loadInferenceMode } from '../src/device/inference-mode';
import { GhostButton, ModeChip, PrimaryButton, colors, fonts } from '../src/ui';

export default function ChatScreen() {
  const router = useRouter();
  const [gatewayUrl, setGatewayUrl] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('loading…');
  const [ready, setReady] = useState(false);
  const conversationIdRef = useRef<string | null>(null);
  const sessionRef = useRef<RunSession | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const mode = await loadInferenceMode();
      if (cancelled) {
        return;
      }
      if (mode === 'litert') {
        router.replace('/on-device' as Href);
        return;
      }

      const saved = await loadSavedConnection();
      if (!saved) {
        setStatus('not paired — connect first');
        setReady(true);
        return;
      }
      setClientAuth({ token: saved.token || undefined });
      setGatewayUrl(saved.gatewayUrl);
      try {
        const workspaces = await listWorkspaces(saved.gatewayUrl);
        let ws = workspaces[0] ?? null;
        if (!ws) {
          ws = await createWorkspace(saved.gatewayUrl, 'Mobile');
        }
        const conversations = await listConversations(saved.gatewayUrl, ws.id);
        let cv = conversations[0] ?? null;
        if (!cv) {
          cv = await createConversation(saved.gatewayUrl, ws.id, 'Chat');
        }
        if (cancelled) {
          return;
        }
        conversationIdRef.current = cv.id;
        setMessages(await listMessages(saved.gatewayUrl, cv.id));
        setStatus(`gateway · ${ws.name}`);
        setReady(true);
      } catch (err) {
        if (!cancelled) {
          setStatus(err instanceof Error ? err.message : String(err));
          setReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
      sessionRef.current?.close();
    };
  }, [router]);

  const send = useCallback(() => {
    const content = draft.trim();
    const conversationId = conversationIdRef.current;
    if (!gatewayUrl || !conversationId || busy || !content) {
      return;
    }
    setDraft('');
    setBusy(true);
    setStreaming('');
    setMessages((prev) => [
      ...prev,
      {
        id: `local_${Date.now()}`,
        conversationId,
        role: 'user',
        content,
        createdAt: Date.now(),
      },
    ]);
    sessionRef.current?.close();
    sessionRef.current = streamChat(gatewayUrl, conversationId, content, {
      onEvent: (event) => {
        if (event.type === 'message.delta') {
          setStreaming((prev) => prev + event.text);
        }
        if (event.type === 'run.completed' || event.type === 'run.failed') {
          setBusy(false);
          if (event.type === 'run.failed') {
            setStatus(event.error.message);
          }
          void listMessages(gatewayUrl, conversationId).then((items) => {
            setMessages(items);
            setStreaming('');
            return undefined;
          });
        }
      },
      onError: (err) => {
        setBusy(false);
        setStatus(err.message);
      },
    });
  }, [busy, draft, gatewayUrl]);

  if (!ready) {
    return (
      <SafeAreaView style={styles.root}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

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
          label="settings"
          onPress={() => {
            router.push('/settings' as Href);
          }}
          style={styles.topBtn}
        />
      </View>
      <View style={styles.modeRow}>
        <ModeChip mode="gateway" />
      </View>
      <Text style={styles.meta}>{status}</Text>
      <FlatList
        style={styles.list}
        data={messages}
        keyExtractor={(item) => item.id}
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
  modeRow: { paddingHorizontal: 16, marginTop: 8 },
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
});
