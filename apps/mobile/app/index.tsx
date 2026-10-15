import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useCallback, useState } from 'react';
import { checkHealth, streamDemo } from '@involvex/ctrl-i';

const DEFAULT_GATEWAY = 'http://127.0.0.1:7331';

export default function IndexScreen() {
  const [gatewayUrl, setGatewayUrl] = useState(DEFAULT_GATEWAY);
  const [health, setHealth] = useState('idle');
  const [streamState, setStreamState] = useState('idle');
  const [streamText, setStreamText] = useState('');
  const [busy, setBusy] = useState(false);

  const connect = useCallback(async () => {
    setBusy(true);
    setHealth('checking…');
    setStreamText('');
    setStreamState('idle');
    try {
      const h = await checkHealth(gatewayUrl);
      setHealth(`ok ${h.version}`);
      setStreamState('connecting');
      streamDemo(gatewayUrl, {
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
  }, [gatewayUrl]);

  return (
    <View style={styles.root}>
      <Text style={styles.brand}>ctrl</Text>
      <Text style={styles.tagline}>local agent platform</Text>
      <Text style={styles.label}>Gateway URL (LAN IP from desktop)</Text>
      <TextInput
        style={styles.input}
        value={gatewayUrl}
        onChangeText={setGatewayUrl}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!busy}
        placeholderTextColor="#6b7f72"
        placeholder="http://192.168.x.x:PORT"
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 12,
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
    marginBottom: 24,
  },
  label: {
    alignSelf: 'stretch',
    color: '#00ff66',
    fontFamily: 'monospace',
    fontSize: 12,
    opacity: 0.8,
  },
  input: {
    alignSelf: 'stretch',
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
    color: '#00ff66',
    fontFamily: 'monospace',
    fontSize: 12,
    opacity: 0.75,
    marginTop: 4,
  },
});
