import { useRouter, type Href } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text } from 'react-native';
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
import {
  defaultGatewayUrl,
  guessDevHostIp,
} from '../src/connection/dev-gateway';
import { loadSavedConnection, saveConnection } from '../src/connection/storage';
import {
  loadGeneratorMode,
  saveGeneratorMode,
  type GeneratorMode,
} from '../src/device/inference-mode';
import {
  Field,
  ModeChip,
  NavRow,
  PrimaryButton,
  Section,
  StatusPanel,
  colors,
  fonts,
} from '../src/ui';

function isLoopbackUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === '127.0.0.1' || host === 'localhost' || host === '::1';
  } catch {
    return false;
  }
}

export default function IndexScreen() {
  const router = useRouter();
  const [gatewayUrl, setGatewayUrl] = useState(() => defaultGatewayUrl());
  const [token, setToken] = useState('');
  const [health, setHealth] = useState('idle');
  const [pairing, setPairing] = useState('idle');
  const [workspaces, setWorkspaces] = useState('—');
  const [streamState, setStreamState] = useState('idle');
  const [streamText, setStreamText] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [devHost, setDevHost] = useState<string | null>(null);
  const [inferenceMode, setInferenceMode] = useState<GeneratorMode>('litert');

  useEffect(() => {
    void (async () => {
      const guessed = guessDevHostIp();
      setDevHost(guessed);
      const [saved, mode] = await Promise.all([
        loadSavedConnection(),
        loadGeneratorMode(),
      ]);
      setInferenceMode(mode);
      if (saved && !isLoopbackUrl(saved.gatewayUrl)) {
        setGatewayUrl(saved.gatewayUrl);
        setToken(saved.token);
      } else if (guessed) {
        setGatewayUrl(`http://${guessed}:7331`);
      } else {
        setGatewayUrl(defaultGatewayUrl());
      }
      setReady(true);
    })();
  }, []);

  const openChat = useCallback(() => {
    router.push('/chat' as Href);
  }, [router]);

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
      const lanHint =
        status.urls && status.urls.length > 0 ? ` · lan ${status.urls[0]}` : '';
      setPairing(
        status.required
          ? `auth required · llama ${status.llama?.state ?? 'unknown'}${lanHint}`
          : `open · llama ${status.llama?.state ?? 'unknown'}${lanHint}`
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
        <ActivityIndicator color={colors.accent} />
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
        <ModeChip mode={inferenceMode} />

        <Section
          title="Navigate"
          hint="Tap a row — bordered tiles are actions, not plain labels."
        >
          <NavRow
            label="Scan pair QR"
            subtitle="Camera · LAN pairing"
            onPress={() => {
              router.push('/scan' as Href);
            }}
          />
          <NavRow
            label="Chat"
            subtitle="One transcript · swap On this phone / This PC / Cloud"
            onPress={openChat}
          />
          <NavRow
            label="Knowledge / memory"
            onPress={() => {
              router.push('/knowledge' as Href);
            }}
          />
          <NavRow
            label="Tools / MCP"
            onPress={() => {
              router.push('/tools' as Href);
            }}
          />
          <NavRow
            label="Channels"
            onPress={() => {
              router.push('/channels' as Href);
            }}
          />
          <NavRow
            label="Providers / settings"
            subtitle="Keys · make this the generator"
            onPress={() => {
              router.push('/settings' as Href);
            }}
          />
          <NavRow
            label="Model setup"
            subtitle="LiteRT download · import · policy"
            onPress={() => {
              void (async () => {
                await saveGeneratorMode('litert');
                setInferenceMode('litert');
                router.push('/on-device' as Href);
              })();
            }}
          />
        </Section>

        <Section title="Connect" hint="Editable fields — green border + fill.">
          <Field
            label="Gateway URL"
            hint={
              devHost
                ? `Dev host from Metro: ${devHost} · port 7331`
                : 'Use the LAN IP of the machine running ctrl-a (not 127.0.0.1).'
            }
            value={gatewayUrl}
            onChangeText={setGatewayUrl}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            placeholder="http://192.168.x.x:7331"
          />
          <Field
            label="Pairing token"
            hint="Optional. Required when desktop / CLI LAN auth is enabled."
            value={token}
            onChangeText={setToken}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            secureTextEntry
            placeholder="from ctrl-f5 pair / desktop host"
          />
          <PrimaryButton
            label="connect + verify"
            onPress={() => {
              void connect();
            }}
            busy={busy}
            disabled={busy}
          />
        </Section>

        <Section title="Status">
          <StatusPanel
            lines={[
              `health · ${health}`,
              `pairing · ${pairing}`,
              `workspaces · ${workspaces}`,
              `demo [${streamState}] · ${streamText || '…'}`,
            ]}
          />
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingVertical: 32,
    gap: 12,
  },
  brand: {
    color: colors.accent,
    fontSize: 48,
    fontWeight: '700',
    letterSpacing: 8,
    fontFamily: fonts.mono,
  },
  tagline: {
    color: colors.muted,
    fontFamily: fonts.mono,
  },
});
