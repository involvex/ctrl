import { useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  getProviderStatus,
  setClientAuth,
  updateProviderConfig,
  type ProviderStatusResponse,
} from '@involvex/ctrl-i';
import type { ProviderId } from '@involvex/ctrl-s';
import { loadSavedConnection } from '../src/connection/storage';

export default function SettingsScreen() {
  const router = useRouter();
  const [gatewayUrl, setGatewayUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<ProviderStatusResponse | null>(null);
  const [keyDraft, setKeyDraft] = useState('');
  const [modelDraft, setModelDraft] = useState('');
  const [deviceUrl, setDeviceUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'gateway' | 'litert'>('gateway');

  const refresh = useCallback(async (url: string) => {
    const next = await getProviderStatus(url);
    setStatus(next);
    setModelDraft(next.model ?? '');
    setDeviceUrl(next.config.device.gatewayUrl ?? url);
  }, []);

  useEffect(() => {
    void (async () => {
      const saved = await loadSavedConnection();
      if (!saved) {
        setError('not paired');
        return;
      }
      setClientAuth({ token: saved.token || undefined });
      setGatewayUrl(saved.gatewayUrl);
      setDeviceUrl(saved.gatewayUrl);
      try {
        await refresh(saved.gatewayUrl);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, [refresh]);

  const select = useCallback(
    async (id: ProviderId) => {
      if (!gatewayUrl) {
        return;
      }
      if (id === 'litert') {
        setMode('litert');
        setError(null);
        router.push('/on-device' as Href);
        return;
      }
      setMode('gateway');
      setBusy(true);
      setError(null);
      try {
        const patch: Parameters<typeof updateProviderConfig>[1] = {
          active: id,
        };
        if (
          keyDraft.trim() &&
          (id === 'openai' || id === 'zen' || id === 'kilo')
        ) {
          if (id === 'openai') {
            patch.openai = { apiKey: keyDraft.trim() };
          } else if (id === 'zen') {
            patch.zen = { apiKey: keyDraft.trim() };
          } else {
            patch.kilo = { apiKey: keyDraft.trim() };
          }
        }
        if (id === 'device') {
          patch.device = {
            gatewayUrl: deviceUrl.trim() || gatewayUrl,
          };
        }
        if (modelDraft.trim()) {
          patch.model = modelDraft.trim();
        }
        const next = await updateProviderConfig(gatewayUrl, patch);
        setStatus(next);
        setKeyDraft('');
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [deviceUrl, gatewayUrl, keyDraft, modelDraft, router]
  );

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.link}>← back</Text>
        </Pressable>
        <Text style={styles.title}>settings</Text>
        <Text style={styles.meta}>
          providers · memory uses gateway workspace · MCP via host tools
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Text style={styles.label}>mode</Text>
        <Text style={styles.meta}>
          {mode === 'litert'
            ? 'on-device LiteRT (phone)'
            : `gateway · ${status?.active ?? '…'}`}
        </Text>

        <Text style={styles.label}>API key (zen / kilo / openai)</Text>
        <TextInput
          style={styles.input}
          value={keyDraft}
          onChangeText={setKeyDraft}
          secureTextEntry
          placeholderTextColor="#6b7f72"
          placeholder="paste key then select provider"
        />
        <Text style={styles.label}>model</Text>
        <TextInput
          style={styles.input}
          value={modelDraft}
          onChangeText={setModelDraft}
          placeholderTextColor="#6b7f72"
          placeholder="model id"
          autoCapitalize="none"
        />
        <Text style={styles.label}>paired PC URL (device provider)</Text>
        <TextInput
          style={styles.input}
          value={deviceUrl}
          onChangeText={setDeviceUrl}
          placeholderTextColor="#6b7f72"
          placeholder="http://192.168.x.x:7331"
          autoCapitalize="none"
        />

        {(status?.providers ?? []).map((p) => (
          <Pressable
            key={p.id}
            style={[
              styles.provider,
              p.id === status?.active && mode === 'gateway'
                ? styles.providerActive
                : null,
            ]}
            disabled={busy}
            onPress={() => {
              void select(p.id);
            }}
          >
            <Text style={styles.providerTitle}>
              {p.id === status?.active && mode === 'gateway' ? '● ' : '○ '}
              {p.label}
            </Text>
            <Text style={styles.meta}>
              {p.description}
              {p.unavailableReason ? ` · ${p.unavailableReason}` : ''}
            </Text>
          </Pressable>
        ))}

        <Pressable
          style={styles.provider}
          onPress={() => {
            void select('litert');
          }}
        >
          <Text style={styles.providerTitle}>
            {mode === 'litert' ? '● ' : '○ '}On-device LiteRT
          </Text>
          <Text style={styles.meta}>
            Run models on this phone (opens /on-device when available).
          </Text>
        </Pressable>

        {busy ? <ActivityIndicator color="#00ff66" /> : null}
        <Pressable onPress={() => router.push('/chat' as Href)}>
          <Text style={styles.link}>open chat →</Text>
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
  link: { color: '#00ff66', fontFamily: 'monospace', marginVertical: 4 },
  label: {
    color: '#00ff66',
    fontFamily: 'monospace',
    fontSize: 12,
    marginTop: 8,
  },
  meta: {
    color: '#6b7f72',
    fontFamily: 'monospace',
    fontSize: 11,
    lineHeight: 16,
  },
  error: { color: '#ff6666', fontFamily: 'monospace', fontSize: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#00ff66',
    color: '#00ff66',
    fontFamily: 'monospace',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#111613',
  },
  provider: {
    borderWidth: 1,
    borderColor: '#1f3328',
    backgroundColor: '#0a0f0c',
    padding: 12,
    gap: 4,
  },
  providerActive: { borderColor: '#00ff66' },
  providerTitle: {
    color: '#00ff66',
    fontFamily: 'monospace',
    fontWeight: '700',
  },
});
