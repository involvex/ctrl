import { useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
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
import {
  loadInferenceMode,
  saveInferenceMode,
  type InferenceMode,
} from '../src/device/inference-mode';
import {
  Field,
  GhostButton,
  ModeChip,
  NavRow,
  PrimaryButton,
  Section,
  colors,
  fonts,
} from '../src/ui';

export default function SettingsScreen() {
  const router = useRouter();
  const [gatewayUrl, setGatewayUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<ProviderStatusResponse | null>(null);
  const [keyDraft, setKeyDraft] = useState('');
  const [modelDraft, setModelDraft] = useState('');
  const [deviceUrl, setDeviceUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<InferenceMode>('gateway');

  const refresh = useCallback(async (url: string) => {
    const next = await getProviderStatus(url);
    setStatus(next);
    setModelDraft(next.model ?? '');
    setDeviceUrl(next.config.device.gatewayUrl ?? url);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [saved, inference] = await Promise.all([
        loadSavedConnection(),
        loadInferenceMode(),
      ]);
      if (cancelled) {
        return;
      }
      setMode(inference);
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
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const openChat = useCallback(() => {
    if (mode === 'litert') {
      router.push('/on-device' as Href);
      return;
    }
    router.push('/chat' as Href);
  }, [mode, router]);

  const select = useCallback(
    async (id: ProviderId) => {
      if (id === 'litert') {
        await saveInferenceMode('litert');
        setMode('litert');
        setError(null);
        router.push('/on-device' as Href);
        return;
      }
      if (!gatewayUrl) {
        return;
      }
      await saveInferenceMode('gateway');
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
        <GhostButton
          label="← back"
          onPress={() => {
            router.back();
          }}
          style={styles.back}
        />
        <Text style={styles.title}>settings</Text>
        <ModeChip mode={mode} />
        <Text style={styles.meta}>
          Providers for gateway chat · LiteRT runs on this phone
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Section
          title="Credentials"
          hint="Editable fields before selecting a provider."
        >
          <Field
            label="API key (zen / kilo / openai)"
            value={keyDraft}
            onChangeText={setKeyDraft}
            secureTextEntry
            placeholder="paste key then select provider"
          />
          <Field
            label="Model"
            value={modelDraft}
            onChangeText={setModelDraft}
            placeholder="model id"
            autoCapitalize="none"
          />
          <Field
            label="Paired PC URL (device provider)"
            value={deviceUrl}
            onChangeText={setDeviceUrl}
            placeholder="http://192.168.x.x:7331"
            autoCapitalize="none"
          />
        </Section>

        <Section
          title="Gateway providers"
          hint="Bordered rows are tappable. Active row uses accent border."
        >
          {(status?.providers ?? []).map((p) => (
            <Pressable
              key={p.id}
              style={({ pressed }) => [
                styles.provider,
                p.id === status?.active && mode === 'gateway'
                  ? styles.providerActive
                  : null,
                pressed && styles.pressed,
              ]}
              disabled={busy}
              onPress={() => {
                void select(p.id);
              }}
              accessibilityRole="button"
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
        </Section>

        <Section title="On-device">
          <Pressable
            style={({ pressed }) => [
              styles.provider,
              mode === 'litert' ? styles.providerActive : null,
              pressed && styles.pressed,
            ]}
            onPress={() => {
              void select('litert');
            }}
            accessibilityRole="button"
          >
            <Text style={styles.providerTitle}>
              {mode === 'litert' ? '● ' : '○ '}On-device LiteRT
            </Text>
            <Text style={styles.meta}>
              Sticky mode — chat opens /on-device until you pick a gateway
              provider.
            </Text>
          </Pressable>
        </Section>

        {busy ? <ActivityIndicator color={colors.accent} /> : null}

        <PrimaryButton label="open chat" onPress={openChat} />
        <NavRow
          label="On-device screen"
          onPress={() => {
            router.push('/on-device' as Href);
          }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 24, gap: 10 },
  back: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 8 },
  title: {
    color: colors.accent,
    fontFamily: fonts.mono,
    fontSize: 22,
    fontWeight: '700',
  },
  meta: {
    color: colors.muted,
    fontFamily: fonts.mono,
    fontSize: 11,
    lineHeight: 16,
  },
  error: { color: colors.danger, fontFamily: fonts.mono, fontSize: 12 },
  provider: {
    borderWidth: 1,
    borderColor: colors.charcoal,
    backgroundColor: colors.panel,
    padding: 12,
    gap: 4,
  },
  providerActive: { borderColor: colors.accent },
  pressed: { opacity: 0.75 },
  providerTitle: {
    color: colors.accent,
    fontFamily: fonts.mono,
    fontWeight: '700',
  },
});
