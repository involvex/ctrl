import { Link, useRouter } from 'expo-router';
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
import { checkHealth, clearClientAuth, setClientAuth } from '@involvex/ctrl-i';
import { loadSavedConnection, saveConnection } from '../src/connection/storage';
import { AppDrawer } from '../src/ui/AppDrawer';

const DEFAULT_GATEWAY = 'http://127.0.0.1:7331';

export default function IndexScreen() {
  const router = useRouter();
  const [gatewayUrl, setGatewayUrl] = useState(DEFAULT_GATEWAY);
  const [token, setToken] = useState('');
  const [health, setHealth] = useState('idle');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    void (async () => {
      const saved = await loadSavedConnection();
      if (saved) {
        setGatewayUrl(saved.gatewayUrl);
        setToken(saved.token);
        setClientAuth({ token: saved.token || undefined });
        try {
          const h = await checkHealth(saved.gatewayUrl);
          setHealth(`ok · ${h.version}`);
        } catch {
          setHealth('saved · offline');
        }
      }
      setReady(true);
    })();
  }, []);

  const connect = useCallback(async () => {
    setBusy(true);
    setHealth('checking…');
    const url = gatewayUrl.trim();
    const authToken = token.trim();
    if (authToken) {
      setClientAuth({ token: authToken });
    } else {
      clearClientAuth();
    }
    try {
      const h = await checkHealth(url);
      setHealth(`ok · ${h.version}`);
      await saveConnection({ gatewayUrl: url, token: authToken });
    } catch (err) {
      setHealth(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [gatewayUrl, token]);

  if (!ready) {
    return (
      <View style={styles.rootCenter}>
        <ActivityIndicator color="#00ff66" />
      </View>
    );
  }

  return (
    <>
      <AppDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <ScrollView contentContainerStyle={styles.root}>
        <View style={styles.topRow}>
          <Pressable onPress={() => setDrawerOpen(true)}>
            <Text style={styles.link}>☰ menu</Text>
          </Pressable>
          <Pressable onPress={() => router.push('/chat')}>
            <Text style={styles.primaryLink}>chat →</Text>
          </Pressable>
        </View>
        <Text style={styles.brand}>ctrl</Text>
        <Text style={styles.tagline}>local agent platform · pwa</Text>
        <Text style={styles.hint}>
          Chat-first · pair the gateway below when you need host tools.
        </Text>
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
            <Text style={styles.outlineButtonText}>save + health check</Text>
          )}
        </Pressable>
        <Text style={styles.meta}>health: {health}</Text>
        <Pressable
          style={styles.buttonWide}
          onPress={() => router.push('/chat')}
        >
          <Text style={styles.buttonText}>open chat</Text>
        </Pressable>
        <View style={styles.nav}>
          <Link href="/conversations" style={styles.link}>
            conversations →
          </Link>
          <Link href="/agents" style={styles.link}>
            agents →
          </Link>
          <Link href="/settings" style={styles.link}>
            providers →
          </Link>
          <Link href="/knowledge" style={styles.link}>
            knowledge →
          </Link>
          <Link href="/tools" style={styles.link}>
            tools / MCP →
          </Link>
          <Link href="/channels" style={styles.link}>
            channels →
          </Link>
          <Link href="/backups" style={styles.link}>
            backups →
          </Link>
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  rootCenter: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  root: {
    flexGrow: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
    gap: 12,
  },
  topRow: {
    alignSelf: 'stretch',
    maxWidth: 420,
    flexDirection: 'row',
    justifyContent: 'space-between',
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
    marginBottom: 8,
  },
  hint: {
    alignSelf: 'stretch',
    maxWidth: 420,
    color: '#6b7f72',
    fontFamily: 'monospace',
    fontSize: 12,
    marginBottom: 16,
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
    backgroundColor: '#111613',
    borderWidth: 1,
    borderColor: '#00ff66',
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonWide: {
    alignSelf: 'stretch',
    maxWidth: 420,
    backgroundColor: '#00ff66',
    paddingVertical: 14,
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
  outlineButtonText: {
    color: '#00ff66',
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
  primaryLink: {
    color: '#00ff66',
    fontFamily: 'monospace',
    fontSize: 14,
    fontWeight: '700',
  },
});
