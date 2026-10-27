import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  loadProviderStack,
  moveProvider,
  saveProviderStack,
  setProviderEnabled,
  type ProviderStack,
} from '../src/providers/stack';
import { GhostButton, Section, colors, fonts } from '../src/ui';

export default function ProvidersScreen() {
  const router = useRouter();
  const [stack, setStack] = useState<ProviderStack | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      setStack(await loadProviderStack());
    })();
  }, []);

  const persist = useCallback(async (next: ProviderStack) => {
    setStack(next);
    setBusy(true);
    try {
      await saveProviderStack(next);
    } finally {
      setBusy(false);
    }
  }, []);

  if (!stack) {
    return (
      <SafeAreaView style={styles.root}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

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
        <Text style={styles.title}>providers</Text>
        <Text style={styles.meta}>
          Send tries enabled providers top → bottom. On failure (offline /
          timeout / load error) the next one runs automatically.
        </Text>

        <Section title="Priority order">
          {stack.order.map((id, index) => {
            const entry = stack.entries[id];
            if (!entry) {
              return null;
            }
            return (
              <View key={id} style={styles.card}>
                <View style={styles.cardTop}>
                  <Text style={styles.cardTitle}>
                    {index + 1}. {entry.label}
                  </Text>
                  <Pressable
                    onPress={() => {
                      void persist(
                        setProviderEnabled(stack, id, !entry.enabled)
                      );
                    }}
                  >
                    <Text style={styles.toggle}>
                      {entry.enabled ? 'ON' : 'OFF'}
                    </Text>
                  </Pressable>
                </View>
                <Text style={styles.meta}>kind · {entry.kind}</Text>
                <View style={styles.row}>
                  <GhostButton
                    label="↑"
                    disabled={busy || index === 0}
                    onPress={() => {
                      void persist(moveProvider(stack, id, 'up'));
                    }}
                  />
                  <GhostButton
                    label="↓"
                    disabled={busy || index === stack.order.length - 1}
                    onPress={() => {
                      void persist(moveProvider(stack, id, 'down'));
                    }}
                  />
                </View>
              </View>
            );
          })}
        </Section>

        <Text style={styles.meta}>
          Cloud / This PC keys still live under Host settings. On this phone
          needs a loaded LiteRT model.
        </Text>
        <GhostButton
          label="Host settings →"
          onPress={() => {
            router.push('/settings');
          }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 24, gap: 12 },
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
  card: {
    borderWidth: 1,
    borderColor: colors.charcoal,
    padding: 12,
    gap: 8,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    color: colors.accent,
    fontFamily: fonts.mono,
    fontWeight: '700',
    fontSize: 13,
    flex: 1,
  },
  toggle: {
    color: colors.accent,
    fontFamily: fonts.mono,
    fontWeight: '700',
    fontSize: 12,
  },
  row: { flexDirection: 'row', gap: 8 },
});
