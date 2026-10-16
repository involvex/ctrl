import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
} from 'react-native';
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (url: string) => {
    const next = await getProviderStatus(url);
    setStatus(next);
    setModelDraft(next.model ?? '');
  }, []);

  useEffect(() => {
    void (async () => {
      const saved = await loadSavedConnection();
      if (!saved) {
        setError('not connected');
        return;
      }
      setClientAuth({ token: saved.token || undefined });
      setGatewayUrl(saved.gatewayUrl);
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
    [gatewayUrl, keyDraft, modelDraft]
  );

  return (
    <ScrollView contentContainerStyle={styles.root}>
      <Pressable onPress={() => router.back()}>
        <Text style={styles.link}>← back</Text>
      </Pressable>
      <Text style={styles.title}>providers</Text>
      <Text style={styles.meta}>
        active · {status?.active ?? '…'}
        {status?.model ? ` · ${status.model}` : ''}
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
        placeholder="optional model id"
      />
      {busy ? <ActivityIndicator color="#00ff66" /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {(status?.providers ?? []).map((p) => (
        <Pressable
          key={p.id}
          style={[
            styles.provider,
            p.id === status?.active && styles.providerActive,
          ]}
          disabled={busy || (!p.available && p.id !== 'mock')}
          onPress={() => {
            void select(p.id);
          }}
        >
          <Text style={styles.providerTitle}>
            {p.id === status?.active ? '●' : '○'} {p.label}
          </Text>
          <Text style={styles.meta}>
            {p.kind}
            {p.configured ? ' · configured' : ' · needs key'}
            {p.unavailableReason ? ` · ${p.unavailableReason}` : ''}
          </Text>
        </Pressable>
      ))}
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
