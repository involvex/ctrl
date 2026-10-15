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
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  checkHealth,
  clearClientAuth,
  getPairingStatus,
  listWorkspaces,
  setClientAuth,
  streamDemo,
} from '@involvex/ctrl-i';

const DEFAULT_GATEWAY = 'http://127.0.0.1:7331';
const STORAGE_KEY = 'ctrl.mobile.connection';

type SavedConnection = {
  gatewayUrl: string;
  token: string;
};

function parseSavedConnection(raw: string): SavedConnection | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object') {
    return null;
  }
  if (!('gatewayUrl' in value) || typeof value.gatewayUrl !== 'string') {
    return null;
  }
  return {
    gatewayUrl: value.gatewayUrl,
    token:
      'token' in value && typeof value.token === 'string' ? value.token : '',
  };
}

async function loadSaved(): Promise<SavedConnection | null> {
  try {
    const AsyncStorage = (
      await import('@react-native-async-storage/async-storage')
    ).default;
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return parseSavedConnection(raw);
  } catch {
    return null;
  }
}

async function saveConnection(value: SavedConnection): Promise<void> {
  try {
    const AsyncStorage = (
      await import('@react-native-async-storage/async-storage')
    ).default;
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Persistence is best-effort on web/native.
  }
}

export default function IndexScreen() {
  const [gatewayUrl, setGatewayUrl] = useState(DEFAULT_GATEWAY);
  const [token, setToken] = useState('');
  const [health, setHealth] = useState('idle');
  const [pairing, setPairing] = useState('idle');
  const [workspaces, setWorkspaces] = useState('—');
  const [streamState, setStreamState] = useState('idle');
  const [streamText, setStreamText] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      const saved = await loadSaved();
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
    setPairing('checking…');
    setWorkspaces('—');
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
      await saveConnection({ gatewayUrl: url, token: authToken });

      const status = await getPairingStatus(url);
      setPairing(
        status.required
          ? `auth required · llama ${status.llama?.state ?? 'unknown'}`
          : `open · llama ${status.llama?.state ?? 'unknown'}`
      );
      if (status.required && !authToken) {
        setHealth('token required for this gateway');
        setBusy(false);
        return;
      }

      const h = await checkHealth(url);
      setHealth(`ok · ${h.version}`);

      try {
        const items = await listWorkspaces(url);
        setWorkspaces(
          items.length === 0 ? 'none yet' : items.map((w) => w.name).join(', ')
        );
      } catch (err) {
        setWorkspaces(err instanceof Error ? err.message : String(err));
      }

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
      <SafeAreaView style={styles.root}>
        <ActivityIndicator color="#00ff66" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.brand}>ctrl</Text>
        <Text style={styles.tagline}>local agent · mobile</Text>

        <Text style={styles.label}>Gateway URL</Text>
        <Text style={styles.hint}>
          Use the desktop LAN IP (not 127.0.0.1) when testing on a phone.
        </Text>
        <TextInput
          style={styles.input}
          value={gatewayUrl}
          onChangeText={setGatewayUrl}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy}
          placeholderTextColor="#6b7f72"
          placeholder="http://192.168.x.x:7331"
        />

        <Text style={styles.label}>Pairing token</Text>
        <Text style={styles.hint}>
          Optional. Required when desktop LAN auth is enabled.
        </Text>
        <TextInput
          style={styles.input}
          value={token}
          onChangeText={setToken}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy}
          secureTextEntry
          placeholderTextColor="#6b7f72"
          placeholder="paste from desktop host"
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
            <Text style={styles.buttonText}>connect + verify</Text>
          )}
        </Pressable>

        <View style={styles.panel}>
          <Text style={styles.meta}>health · {health}</Text>
          <Text style={styles.meta}>pairing · {pairing}</Text>
          <Text style={styles.meta}>workspaces · {workspaces}</Text>
          <Text style={styles.meta}>
            demo [{streamState}] · {streamText || '…'}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingVertical: 32,
    gap: 10,
  },
  brand: {
    color: '#00ff66',
    fontSize: 48,
    fontWeight: '700',
    letterSpacing: 8,
    fontFamily: 'monospace',
  },
  tagline: {
    color: '#6b7f72',
    fontFamily: 'monospace',
    marginBottom: 20,
  },
  label: {
    color: '#00ff66',
    fontFamily: 'monospace',
    fontSize: 12,
    opacity: 0.9,
    marginTop: 8,
  },
  hint: {
    color: '#6b7f72',
    fontFamily: 'monospace',
    fontSize: 11,
    lineHeight: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#00ff66',
    color: '#00ff66',
    fontFamily: 'monospace',
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#111613',
  },
  button: {
    backgroundColor: '#00ff66',
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#000000',
    fontFamily: 'monospace',
    fontWeight: '700',
  },
  panel: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#1f3328',
    backgroundColor: '#0a0f0c',
    padding: 14,
    gap: 8,
  },
  meta: {
    color: '#00ff66',
    fontFamily: 'monospace',
    fontSize: 12,
    opacity: 0.85,
  },
});
