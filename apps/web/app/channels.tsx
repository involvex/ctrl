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

export default function ChannelsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<ChannelPublic[]>([]);
  const [name, setName] = useState('webhook');
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

  const onCreateWebhook = useCallback(() => {
    if (!gatewayUrl || !workspaceId || name.trim().length === 0) {
      return;
    }
    setBusy(true);
    void (async () => {
      try {
        await createChannel(gatewayUrl, workspaceId, {
          kind: 'webhook',
          name: name.trim(),
        });
        setName('webhook');
        await refresh();
      } catch (err) {
        setStatus(err instanceof Error ? err.message : String(err));
        setBusy(false);
      }
    })();
  }, [gatewayUrl, name, refresh, workspaceId]);

  return (
    <ScrollView contentContainerStyle={styles.root}>
      <Pressable onPress={() => router.back()}>
        <Text style={styles.link}>← back</Text>
      </Pressable>
      <Text style={styles.title}>channels</Text>
      <Text style={styles.meta}>{status}</Text>
      <Text style={styles.meta}>
        webhook · telegram · discord · slack (gateway adapters)
      </Text>
      <Pressable style={styles.button} onPress={() => void refresh()}>
        {busy ? (
          <ActivityIndicator color="#000" />
        ) : (
          <Text style={styles.buttonText}>refresh</Text>
        )}
      </Pressable>
      <Text style={styles.label}>add webhook channel</Text>
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
      <Pressable
        style={[styles.button, (busy || !workspaceId) && styles.buttonDisabled]}
        onPress={onCreateWebhook}
        disabled={busy || !workspaceId}
      >
        <Text style={styles.buttonText}>add webhook</Text>
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
    backgroundColor: '#0a0f0c',
  },
});
