import { useFocusEffect, useRouter, type Href } from 'expo-router';
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
} from '@involvex/ctrl-i';
import {
  defaultGatewayUrl,
  guessDevHostIp,
} from '../src/connection/dev-gateway';
import {
  connectionFromScanData,
  loadSavedConnection,
  saveConnection,
} from '../src/connection/storage';
import {
  loadGeneratorMode,
  type GeneratorMode,
} from '../src/device/inference-mode';
import {
  Field,
  GhostButton,
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
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [devHost, setDevHost] = useState<string | null>(null);
  const [inferenceMode, setInferenceMode] = useState<GeneratorMode>('litert');
  const [pastePayload, setPastePayload] = useState('');
  const [pasteError, setPasteError] = useState<string | null>(null);

  const hydrateConnection = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    void (async () => {
      await hydrateConnection();
      setReady(true);
    })();
  }, [hydrateConnection]);

  useFocusEffect(
    useCallback(() => {
      void hydrateConnection();
    }, [hydrateConnection])
  );

  const openChat = useCallback(() => {
    router.push('/chat' as Href);
  }, [router]);

  const applyPastePayload = useCallback(() => {
    setPasteError(null);
    const connection = connectionFromScanData(pastePayload);
    if (!connection) {
      setPasteError(
        'Not a ctrl pair payload — paste the JSON line from desktop / ctrl-f5 pair.'
      );
      return;
    }
    setGatewayUrl(connection.gatewayUrl);
    setToken(connection.token);
    setPastePayload('');
  }, [pastePayload]);

  const connect = useCallback(async () => {
    setBusy(true);
    setHealth('checking…');
    setPairing('checking…');
    setWorkspaces('—');

    const url = gatewayUrl.trim();
    const authToken = token.trim();
    if (authToken) {
      setClientAuth({ token: authToken });
    } else {
      clearClientAuth();
    }

    try {
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
      await saveConnection({ gatewayUrl: url, token: authToken });

      try {
        const items = await listWorkspaces(url);
        setWorkspaces(
          items.length === 0 ? 'none yet' : items.map((w) => w.name).join(', ')
        );
      } catch (err) {
        setWorkspaces(err instanceof Error ? err.message : String(err));
      }
      setBusy(false);
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

        <Section title="Chat" hint="One transcript · pick who answers inside.">
          <PrimaryButton label="Open chat" onPress={openChat} />
        </Section>

        <Section
          title="Connect"
          hint="Best path: scan the QR from desktop Host (or ctrl-f5 pair)."
        >
          <PrimaryButton
            label="Scan pair QR"
            onPress={() => {
              router.push('/scan' as Href);
            }}
          />
          <Field
            label="Or paste pair payload"
            hint="JSON line from desktop “copy pair payload” / ctrl-f5 pair."
            value={pastePayload}
            onChangeText={setPastePayload}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            placeholder='{"v":1,"gatewayUrl":"http://…","token":"…"}'
          />
          <GhostButton
            label="Apply pasted payload"
            onPress={applyPastePayload}
            disabled={busy || pastePayload.trim().length === 0}
          />
          {pasteError ? <Text style={styles.error}>{pasteError}</Text> : null}
          <Field
            label="Gateway URL"
            hint={
              devHost
                ? `Dev host from Metro: ${devHost} · prefer port 7331`
                : 'LAN IP of the PC running ctrl (not 127.0.0.1).'
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
            hint="Filled by Scan / paste. Required when the PC enables LAN auth."
            value={token}
            onChangeText={setToken}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            secureTextEntry
            placeholder="from desktop Host / ctrl-f5 pair"
          />
          <PrimaryButton
            label="connect + verify"
            onPress={() => {
              void connect();
            }}
            busy={busy}
            disabled={busy}
          />
          <StatusPanel
            lines={[
              `health · ${health}`,
              `pairing · ${pairing}`,
              `workspaces · ${workspaces}`,
            ]}
          />
        </Section>

        <Section
          title="On this phone"
          hint="LiteRT model files only — does not change chat until you pick the generator."
        >
          <NavRow
            label="Model setup"
            subtitle="Download · import · policy (no auto-load)"
            onPress={() => {
              router.push('/on-device' as Href);
            }}
          />
        </Section>

        <Section title="Host" hint="PC-side providers once paired.">
          <NavRow
            label="Providers / settings"
            subtitle="API keys · This PC / Cloud"
            onPress={() => {
              router.push('/settings' as Href);
            }}
          />
        </Section>

        <Section
          title="Advanced"
          hint="Needs the PC online. Skip until chat + model feel solid."
        >
          <NavRow
            label="Knowledge / memory"
            subtitle="Needs PC online"
            onPress={() => {
              router.push('/knowledge' as Href);
            }}
          />
          <NavRow
            label="Tools / MCP"
            subtitle="Needs PC online"
            onPress={() => {
              router.push('/tools' as Href);
            }}
          />
          <NavRow
            label="Channels"
            subtitle="Needs PC online"
            onPress={() => {
              router.push('/channels' as Href);
            }}
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
  error: {
    color: colors.danger,
    fontFamily: fonts.mono,
    fontSize: 12,
  },
});
