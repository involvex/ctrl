import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text } from 'react-native';
import { useCallback, useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ackPairing,
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
  Field,
  GhostButton,
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

export default function ConnectScreen() {
  const router = useRouter();
  const [gatewayUrl, setGatewayUrl] = useState(() => defaultGatewayUrl());
  const [token, setToken] = useState('');
  const [health, setHealth] = useState('idle');
  const [pairing, setPairing] = useState('idle');
  const [workspaces, setWorkspaces] = useState('—');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [devHost, setDevHost] = useState<string | null>(null);
  const [pastePayload, setPastePayload] = useState('');
  const [pasteError, setPasteError] = useState<string | null>(null);

  const hydrateConnection = useCallback(async () => {
    const guessed = guessDevHostIp();
    setDevHost(guessed);
    const saved = await loadSavedConnection();
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
        await ackPairing(url, { label: 'expo-connect' });
      } catch {
        // Best-effort for CLI pair exit.
      }

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
      const host = (() => {
        try {
          return new URL(url).host;
        } catch {
          return url;
        }
      })();
      const detail = err instanceof Error ? err.message : String(err);
      const refused =
        /ECONNREFUSED|Network request failed|Failed to fetch|unreachable/i.test(
          detail
        );
      setHealth(
        refused
          ? `${host} unreachable (${detail}). Checklist: gateway running · same Wi‑Fi · Windows firewall allows port · use PC LAN IP (not 127.0.0.1)`
          : `${host}: ${detail}`
      );
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
        <GhostButton
          label="← back"
          onPress={() => {
            router.back();
          }}
          style={styles.back}
        />
        <Text style={styles.title}>connect</Text>
        <Text style={styles.meta}>
          Pair this phone with your PC gateway (desktop Host QR or ctrl-f5
          pair).
        </Text>

        <Section title="Scan / paste">
          <PrimaryButton
            label="Scan pair QR"
            onPress={() => {
              router.push('/scan');
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
        </Section>

        <Section title="Manual">
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
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingVertical: 24,
    gap: 12,
  },
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
    fontSize: 12,
    lineHeight: 18,
  },
  error: { color: colors.danger, fontFamily: fonts.mono, fontSize: 12 },
});
