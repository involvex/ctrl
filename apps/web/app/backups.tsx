import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  createBackup,
  listBackups,
  restoreBackup,
  setClientAuth,
  type HostBackupManifest,
} from '@involvex/ctrl-i';
import { loadSavedConnection } from '../src/connection/storage';

export default function BackupsScreen() {
  const router = useRouter();
  const [gatewayUrl, setGatewayUrl] = useState<string | null>(null);
  const [items, setItems] = useState<HostBackupManifest[]>([]);
  const [label, setLabel] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [status, setStatus] = useState('loading…');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async (url: string) => {
    setBusy(true);
    try {
      setItems(await listBackups(url));
      setStatus('ok');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const saved = await loadSavedConnection();
      if (!saved) {
        setStatus('not connected — pair on home');
        return;
      }
      setClientAuth({ token: saved.token || undefined });
      setGatewayUrl(saved.gatewayUrl);
      await refresh(saved.gatewayUrl);
    })();
  }, [refresh]);

  const onCreate = useCallback(() => {
    if (!gatewayUrl) {
      return;
    }
    setBusy(true);
    void (async () => {
      try {
        const pass = passphrase.trim();
        await createBackup(gatewayUrl, {
          label: label.trim() || undefined,
          passphrase: pass.length >= 8 ? pass : undefined,
        });
        setLabel('');
        await refresh(gatewayUrl);
        setStatus('snapshot created');
      } catch (err) {
        setStatus(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    })();
  }, [gatewayUrl, label, passphrase, refresh]);

  const onRestore = useCallback(
    (id: string, encrypted: boolean) => {
      if (!gatewayUrl) {
        return;
      }
      const pass = passphrase.trim();
      if (encrypted && pass.length < 8) {
        setStatus('enter passphrase (≥8) to restore encrypted backup');
        return;
      }
      setBusy(true);
      void (async () => {
        try {
          const result = await restoreBackup(gatewayUrl, id, {
            passphrase: encrypted && pass ? pass : undefined,
          });
          setStatus(
            `restored · ${result.workspaceIds.length} workspace(s) as new`
          );
        } catch (err) {
          setStatus(err instanceof Error ? err.message : String(err));
        } finally {
          setBusy(false);
        }
      })();
    },
    [gatewayUrl, passphrase]
  );

  return (
    <ScrollView contentContainerStyle={styles.root}>
      <Pressable onPress={() => router.back()}>
        <Text style={styles.link}>← back</Text>
      </Pressable>
      <Text style={styles.title}>backups</Text>
      <Text style={styles.meta}>
        Host snapshots on the gateway machine. Optional passphrase (≥8) encrypts
        at rest. Restore creates new workspaces.
      </Text>
      <Text style={styles.meta}>{status}</Text>

      <Text style={styles.label}>label</Text>
      <TextInput
        style={styles.input}
        value={label}
        onChangeText={setLabel}
        placeholder="snapshot label"
        placeholderTextColor="#6b7f72"
        editable={!busy}
      />
      <Text style={styles.label}>passphrase (optional)</Text>
      <TextInput
        style={styles.input}
        value={passphrase}
        onChangeText={setPassphrase}
        secureTextEntry
        placeholder="≥8 chars to encrypt"
        placeholderTextColor="#6b7f72"
        editable={!busy}
      />
      <Pressable
        style={[styles.button, (!gatewayUrl || busy) && styles.buttonDisabled]}
        disabled={!gatewayUrl || busy}
        onPress={onCreate}
      >
        {busy ? (
          <ActivityIndicator color="#000" />
        ) : (
          <Text style={styles.buttonText}>snapshot</Text>
        )}
      </Pressable>
      <Pressable
        style={styles.ghostBtn}
        disabled={!gatewayUrl || busy}
        onPress={() => {
          if (gatewayUrl) {
            void refresh(gatewayUrl);
          }
        }}
      >
        <Text style={styles.ghostText}>refresh list</Text>
      </Pressable>

      <Text style={styles.section}>snapshots</Text>
      {items.length === 0 ? (
        <Text style={styles.meta}>no backups yet</Text>
      ) : (
        items.map((b) => (
          <View key={b.id} style={styles.panel}>
            <Text style={styles.body}>
              {b.label ?? b.id.slice(0, 8)} · {b.workspaceCount} ws
              {b.encrypted ? ' · encrypted' : ''}
            </Text>
            <Text style={styles.meta}>
              {new Date(b.createdAt).toLocaleString()}
            </Text>
            <Pressable
              style={styles.ghostBtn}
              disabled={busy}
              onPress={() => onRestore(b.id, b.encrypted)}
            >
              <Text style={styles.ghostText}>restore as new</Text>
            </Pressable>
          </View>
        ))
      )}
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
  section: {
    color: '#00ff66',
    fontFamily: 'monospace',
    fontWeight: '700',
    fontSize: 13,
    marginTop: 8,
  },
  label: { color: '#00ff66', fontFamily: 'monospace', fontSize: 12 },
  meta: { color: '#6b7f72', fontFamily: 'monospace', fontSize: 12 },
  body: { color: '#00ff66', fontFamily: 'monospace', fontSize: 13 },
  input: {
    borderWidth: 1,
    borderColor: '#00ff66',
    color: '#00ff66',
    fontFamily: 'monospace',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#111613',
  },
  button: {
    backgroundColor: '#00ff66',
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { color: '#000', fontFamily: 'monospace', fontWeight: '700' },
  ghostBtn: {
    borderWidth: 1,
    borderColor: '#1f3328',
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignSelf: 'flex-start',
  },
  ghostText: { color: '#00ff66', fontFamily: 'monospace', fontSize: 12 },
  panel: {
    borderWidth: 1,
    borderColor: '#1f3328',
    padding: 12,
    gap: 6,
  },
});
