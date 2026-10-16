import { Link, type Href } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useCallback, useEffect, useState } from 'react';
import {
  checkHealth,
  clearClientAuth,
  setClientAuth,
  streamDemo,
} from '@involvex/ctrl-i';
import { loadSavedConnection, saveConnection } from '../src/connection/storage';

const DEFAULT_GATEWAY = 'http://127.0.0.1:7331';

export default function IndexScreen() {
  const [gatewayUrl, setGatewayUrl] = useState(DEFAULT_GATEWAY);
  const [token, setToken] = useState('');
  const [health, setHealth] = useState('idle');
  const [streamState, setStreamState] = useState('idle');
  const [streamText, setStreamText] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      const saved = await loadSavedConnection();
      if (saved) {
        setGatewayUrl(saved.gatewayUrl);
        setToken(saved.token);
      }
      setReady(true);
    })();
  }, []);

  const connect = useCallback(async () => {
    setBusy(true);
    setHealth('checking…');
    setStreamText('');
    setStreamState('idle');
    const url = gatewayUrl.trim();
    const authToken = token.trim();
    if (authToken) {
      setClientAuth({ token: authToken });
    } else {
      clearClientAuth();
    }
    try {
      const h = await checkHealth(url);
      setHealth(`ok ${h.version}`);
      await saveConnection({ gatewayUrl: url, token: authToken });
      setStreamState('connecting');
      streamDemo(url, {
        onEvent: (event) => {
          if (event.type === 'run.started') {
            setStreamState('streaming');
            setStreamText('');
          }
          if (event.type === 'message.delta') {
            setStreamText((prev) => prev + event.text);
          }
          if (event.type === 'run.completed') {
            setStreamState('done');
            setBusy(false);
          }
          if (event.type === 'run.failed') {
            setStreamState(`failed: ${event.error.message}`);
            setBusy(false);
          }
        },
        onError: (err) => {
          setStreamState(`error: ${err.message}`);
          setBusy(false);
        },
        onClose: () => {
          setStreamState((s) => (s === 'streaming' ? 'done' : s));
          setBusy(false);
        },
      });
    } catch (err) {
      setHealth(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }, [gatewayUrl, token]);

  if (!ready) {
    return (
      <View style={styles.root}>
        <ActivityIndicator color="#00ff66" />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.root}>
      <Text style={styles.brand}>ctrl</Text>
      <Text style={styles.tagline}>local agent platform · pwa</Text>
      <Text style={styles.label}>Gateway URL</Text>
      <TextInput
        style={styles.input}
        value={gatewayUrl}
        onChangeText={setGatewayUrl}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!busy}
        placeholderTextColor="#6b7f72"
        placeholder="http://127.0.0.1:7331"
      />
      <Text style={styles.label}>Token (optional)</Text>
      <TextInput
        style={styles.input}
        value={token}
        onChangeText={setToken}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!busy}
        placeholderTextColor="#6b7f72"
        placeholder="bearer token"
        secureTextEntry
      />
      <Pressable
        style={[styles.button, busy && styles.buttonDisabled]}
        onPress={() => {
          void connect();
        }}
        disabled={busy}
      >
        {busy ? (
          <ActivityIndicator color="#000000" />
        ) : (
          <Text style={styles.buttonText}>connect + stream demo</Text>
        )}
      </Pressable>
      <Text style={styles.meta}>health: {health}</Text>
      <Text style={styles.meta}>
        demo [{streamState}]: {streamText || '…'}
      </Text>
      <View style={styles.nav}>
        <Link href={'/chat' as Href} style={styles.link}>
          chat →
        </Link>
        <Link href={'/settings' as Href} style={styles.link}>
          providers →
        </Link>
        <Link href={'/knowledge' as Href} style={styles.link}>
          knowledge →
        </Link>
        <Link href={'/tools' as Href} style={styles.link}>
          tools / MCP →
        </Link>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flexGrow: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
    gap: 12,
  },
  brand: {
    color: '#00ff66',
    fontSize: 56,
    fontWeight: '700',
    letterSpacing: 10,
    fontFamily: 'monospace',
  },
  tagline: {
    color: '#6b7f72',
    fontFamily: 'monospace',
    marginBottom: 24,
  },
  label: {
    alignSelf: 'stretch',
    maxWidth: 420,
    color: '#00ff66',
    fontFamily: 'monospace',
    fontSize: 12,
    opacity: 0.8,
  },
  input: {
    alignSelf: 'stretch',
    maxWidth: 420,
    borderWidth: 1,
    borderColor: '#00ff66',
    color: '#00ff66',
    fontFamily: 'monospace',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#111613',
  },
  button: {
    alignSelf: 'stretch',
    maxWidth: 420,
    backgroundColor: '#00ff66',
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#000000',
    fontFamily: 'monospace',
    fontWeight: '700',
  },
  meta: {
    alignSelf: 'stretch',
    maxWidth: 420,
    color: '#00ff66',
    fontFamily: 'monospace',
    fontSize: 12,
    opacity: 0.75,
    marginTop: 4,
  },
  nav: {
    alignSelf: 'stretch',
    maxWidth: 420,
    gap: 8,
    marginTop: 16,
  },
  link: {
    color: '#00ff66',
    fontFamily: 'monospace',
    fontSize: 14,
  },
});
