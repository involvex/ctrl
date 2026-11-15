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
import {
  createChannel,
  listChannels,
  type ChannelPublic,
} from '@involvex/ctrl-i';
import { resolveConnectedWorkspace } from '../src/connection/workspace';

type ChannelKindChoice = 'webhook' | 'telegram' | 'discord' | 'slack';

const KIND_OPTIONS: ChannelKindChoice[] = [
  'webhook',
  'telegram',
  'discord',
  'slack',
];

export default function ChannelsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<ChannelPublic[]>([]);
  const [kind, setKind] = useState<ChannelKindChoice>('webhook');
  const [name, setName] = useState('webhook');
  const [botToken, setBotToken] = useState('');
  const [appToken, setAppToken] = useState('');
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
    if (
      (kind === 'telegram' || kind === 'discord') &&
      botToken.trim().length === 0
    ) {
      setStatus(`${kind} bot token required`);
      return;
    }
    if (kind === 'slack') {
      if (botToken.trim().length === 0) {
        setStatus('slack bot token required');
        return;
      }
      if (appToken.trim().length === 0) {
        setStatus('slack app token (xapp) required for Socket Mode inbound');
        return;
      }
    }
    setBusy(true);
    void (async () => {
      try {
        const config =
          kind === 'telegram' || kind === 'discord'
            ? { botToken: botToken.trim() }
            : kind === 'slack'
              ? {
                  botToken: botToken.trim(),
                  appToken: appToken.trim(),
                }
              : undefined;
        await createChannel(gatewayUrl, workspaceId, {
          kind,
          name: name.trim(),
          ...(config ? { config } : {}),
        });
        setBotToken('');
        setAppToken('');
        setName(kind);
        await refresh();
      } catch (err) {
        setStatus(err instanceof Error ? err.message : String(err));
        setBusy(false);
      }
    })();
  }, [appToken, botToken, gatewayUrl, kind, name, refresh, workspaceId]);

  return (
    <ScrollView contentContainerStyle={styles.root}>
      <Pressable onPress={() => router.back()}>
        <Text style={styles.link}>← back</Text>
      </Pressable>
      <Text style={styles.title}>channels</Text>
      <Text style={styles.meta}>{status}</Text>
      <Text style={styles.meta}>
        webhook · telegram · discord gateway · slack socket · running = inbound
        connected
      </Text>
      <Pressable style={styles.button} onPress={() => void refresh()}>
        {busy ? (
          <ActivityIndicator color="#000" />
        ) : (
          <Text style={styles.buttonText}>refresh</Text>
        )}
      </Pressable>
      <Text style={styles.label}>kind</Text>
      <View style={styles.kindRow}>
        {KIND_OPTIONS.map((option) => (
          <Pressable
            key={option}
            style={[styles.kindBtn, kind === option && styles.kindBtnActive]}
            onPress={() => selectKind(option)}
            disabled={busy}
          >
            <Text
              style={[
                styles.kindBtnText,
                kind === option && styles.kindBtnTextActive,
              ]}
            >
              {option}
            </Text>
          </Pressable>
        ))}
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
      {kind === 'telegram' || kind === 'discord' || kind === 'slack' ? (
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
      {kind === 'slack' ? (
        <TextInput
          style={styles.input}
          value={appToken}
          onChangeText={setAppToken}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy}
          placeholderTextColor="#6b7f72"
          placeholder="app token (xapp-…)"
          secureTextEntry
        />
      ) : null}
      <Pressable
        style={[styles.button, (busy || !workspaceId) && styles.buttonDisabled]}
        onPress={onCreateChannel}
        disabled={busy || !workspaceId}
      >
        <Text style={styles.buttonText}>add {kind}</Text>
      </Pressable>
      <Text style={styles.label}>configured</Text>
      {items.length === 0 ? (
        <Text style={styles.meta}>no channels yet</Text>
      ) : (
        items.map((ch) => (
          <View key={ch.id} style={styles.panel}>
            <Text style={styles.body}>
              {ch.kind} · {ch.name} · {ch.status}
              {ch.lastError ? ` · ${ch.lastError}` : ''}
            </Text>
          </View>
        ))
      )}
      <Pressable
        onPress={() => {
          router.push('/tools');
        }}
      >
        <Text style={styles.link}>tools →</Text>
      </Pressable>
      <Pressable
        onPress={() => {
          router.push('/chat');
        }}
      >
        <Text style={styles.link}>chat →</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { padding: 24, gap: 10, backgroundColor: '#000', flexGrow: 1 },
  title: {
    color: '#00ff66',
    fontFamily: 'monospace',
    fontSize: 22,
    fontWeight: '700',
  },
  link: { color: '#00ff66', fontFamily: 'monospace' },
  label: { color: '#00ff66', fontFamily: 'monospace', fontSize: 12 },
  meta: { color: '#6b7f72', fontFamily: 'monospace', fontSize: 12 },
  body: { color: '#00ff66', fontFamily: 'monospace', fontSize: 13 },
  kindRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
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
    padding: 12,
  },
});
