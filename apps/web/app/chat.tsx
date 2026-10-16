import { useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
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

export default function ChatScreen() {
  const router = useRouter();
  const [gatewayUrl, setGatewayUrl] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('loading…');
  const conversationIdRef = useRef<string | null>(null);
  const sessionRef = useRef<RunSession | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const saved = await loadSavedConnection();
      if (!saved) {
        setStatus('not connected — go home first');
        return;
      }
      setClientAuth({ token: saved.token || undefined });
      setGatewayUrl(saved.gatewayUrl);
      try {
        const workspaces = await listWorkspaces(saved.gatewayUrl);
        let ws = workspaces[0] ?? null;
        if (!ws) {
          ws = await createWorkspace(saved.gatewayUrl, 'Web');
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
        setStatus(`ok · ${ws.name}`);
      } catch (err) {
        if (!cancelled) {
          setStatus(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
      sessionRef.current?.close();
    };
  }, []);

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
          });
        }
      },
      onError: (err) => {
        setBusy(false);
        setStatus(err.message);
      },
    });
  }, [busy, draft, gatewayUrl]);

  return (
    <View style={styles.root}>
      <View style={styles.top}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.link}>← back</Text>
        </Pressable>
        <Text style={styles.title}>chat</Text>
        <Pressable onPress={() => router.push('/settings' as Href)}>
          <Text style={styles.link}>providers</Text>
        </Pressable>
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
});
