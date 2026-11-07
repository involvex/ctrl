import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  createChannel,
  listChannels,
  type ChannelPublic,
} from '@involvex/ctrl-i';
import { resolveConnectedWorkspace } from '../src/connection/workspace';

type ChannelKindChoice = 'webhook' | 'telegram';

export default function ChannelsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<ChannelPublic[]>([]);
  const [kind, setKind] = useState<ChannelKindChoice>('webhook');
  const [name, setName] = useState('webhook');
  const [botToken, setBotToken] = useState('');
  const [status, setStatus] = useState('loading…');
  const [busy, setBusy] = useState(true);
  const [gatewayUrl, setGatewayUrl] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const connected = await resolveConnectedWorkspace();
      setGatewayUrl(connected.gatewayUrl);
      setWorkspaceId(connected.workspace.id);
      const channels = await listChannels(
        connected.gatewayUrl,
        connected.workspace.id
      );
      setItems(channels);
      setStatus(
        `gateway · ${connected.gatewayUrl} · ${channels.length} channels`
      );
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setBusy(true);
      try {
        const connected = await resolveConnectedWorkspace();
        const channels = await listChannels(
          connected.gatewayUrl,
          connected.workspace.id
        );
        if (cancelled) {
          return;
        }
        setGatewayUrl(connected.gatewayUrl);
        setWorkspaceId(connected.workspace.id);
        setItems(channels);
        setStatus(
          `gateway · ${connected.gatewayUrl} · ${channels.length} channels`
        );
      } catch (err) {
        if (!cancelled) {
          setStatus(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) {
          setBusy(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectKind = useCallback((next: ChannelKindChoice) => {
    setKind(next);
    setName(next);
  }, []);

  const onCreateChannel = useCallback(() => {
    if (!gatewayUrl || !workspaceId || name.trim().length === 0) {
      return;
    }
    if (kind === 'telegram' && botToken.trim().length === 0) {
      setStatus('telegram bot token required');
      return;
    }
    setBusy(true);
    void (async () => {
      try {
        await createChannel(gatewayUrl, workspaceId, {
          kind,
          name: name.trim(),
          ...(kind === 'telegram'
            ? { config: { botToken: botToken.trim() } }
            : {}),
        });
        setBotToken('');
        setName(kind);
        await refresh();
      } catch (err) {
        setStatus(err instanceof Error ? err.message : String(err));
        setBusy(false);
      }
    })();
  }, [botToken, gatewayUrl, kind, name, refresh, workspaceId]);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.link}>← back</Text>
        </Pressable>
        <Text style={styles.title}>channels</Text>
        <Text style={styles.meta}>{status}</Text>
        <Text style={styles.meta}>webhook · telegram (long-poll inbound)</Text>
        <Pressable onPress={() => void refresh()}>
          <Text style={styles.link}>{busy ? 'refreshing…' : 'refresh'}</Text>
        </Pressable>

        <Text style={styles.label}>kind</Text>
        <View style={styles.kindRow}>
          <Pressable
            style={[styles.kindBtn, kind === 'webhook' && styles.kindBtnActive]}
            onPress={() => selectKind('webhook')}
            disabled={busy}
          >
            <Text
              style={[
                styles.kindBtnText,
                kind === 'webhook' && styles.kindBtnTextActive,
              ]}
            >
              webhook
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.kindBtn,
              kind === 'telegram' && styles.kindBtnActive,
            ]}
            onPress={() => selectKind('telegram')}
            disabled={busy}
          >
            <Text
              style={[
                styles.kindBtnText,
                kind === 'telegram' && styles.kindBtnTextActive,
              ]}
            >
              telegram
            </Text>
          </Pressable>
        </View>

        <Text style={styles.label}>add {kind} channel</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy}
          placeholderTextColor="#6b7f72"
          placeholder="channel name"
        />
        {kind === 'telegram' ? (
          <TextInput
            style={styles.input}
            value={botToken}
            onChangeText={setBotToken}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            placeholderTextColor="#6b7f72"
            placeholder="bot token"
            secureTextEntry
          />
        ) : null}
        <Pressable
          style={[styles.button, busy && styles.buttonDisabled]}
          onPress={onCreateChannel}
          disabled={busy || !workspaceId}
        >
          {busy ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.buttonText}>add {kind}</Text>
          )}
        </Pressable>

        <Text style={styles.label}>configured</Text>
        {items.map((ch) => (
          <View key={ch.id} style={styles.panel}>
            <Text style={styles.emphasis}>
              {ch.kind} · {ch.name} · {ch.status}
            </Text>
            {ch.lastError ? (
              <Text style={styles.meta}>{ch.lastError}</Text>
            ) : null}
          </View>
        ))}
        {items.length === 0 && !busy ? (
          <Text style={styles.meta}>no channels yet</Text>
        ) : null}

        <Pressable
          onPress={() => {
            router.push('/tools');
          }}
        >
          <Text style={styles.link}>tools / MCP →</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            router.push('/chat');
          }}
        >
          <Text style={styles.link}>chat →</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  scroll: { padding: 24, gap: 10 },
  title: {
    color: '#00ff66',
    fontFamily: 'monospace',
    fontSize: 22,
    fontWeight: '700',
  },
  link: { color: '#00ff66', fontFamily: 'monospace' },
  label: {
    color: '#00ff66',
    fontFamily: 'monospace',
    fontSize: 12,
    marginTop: 10,
  },
  meta: {
    color: '#6b7f72',
    fontFamily: 'monospace',
    fontSize: 12,
    lineHeight: 18,
  },
  emphasis: {
    color: '#00ff66',
    fontFamily: 'monospace',
    fontWeight: '700',
    fontSize: 13,
  },
  kindRow: { flexDirection: 'row', gap: 8 },
  kindBtn: {
    borderWidth: 1,
    borderColor: '#00ff66',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  kindBtnActive: { backgroundColor: '#00ff66' },
  kindBtnText: { color: '#00ff66', fontFamily: 'monospace', fontSize: 12 },
  kindBtnTextActive: { color: '#000', fontWeight: '700' },
  input: {
    borderWidth: 1,
    borderColor: '#00ff66',
    color: '#00ff66',
    fontFamily: 'monospace',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  button: {
    backgroundColor: '#00ff66',
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { color: '#000', fontFamily: 'monospace', fontWeight: '700' },
  panel: {
    borderWidth: 1,
    borderColor: '#1f3328',
    backgroundColor: '#0a0f0c',
    padding: 12,
    gap: 4,
  },
});
