import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ProviderDragList } from '../src/providers/ProviderDragList';
import {
  loadProviderStack,
  reorderProviders,
  saveProviderStack,
  setProviderEnabled,
  type ProviderStack,
} from '../src/providers/stack';
import { GhostButton, Section, colors, fonts } from '../src/ui';

export default function ProvidersScreen() {
  const router = useRouter();
  const [stack, setStack] = useState<ProviderStack | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    void (async () => {
      setStack(await loadProviderStack());
    })();
  }, []);

  const onReorder = useCallback((from: number, to: number) => {
    setStack((current) => {
      if (!current) {
        return current;
      }
      const next = reorderProviders(current, from, to);
      void saveProviderStack(next);
      return next;
    });
  }, []);

  const onToggle = useCallback((id: string, enabled: boolean) => {
    setStack((current) => {
      if (!current) {
        return current;
      }
      const next = setProviderEnabled(current, id, enabled);
      void saveProviderStack(next);
      return next;
    });
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
      <ScrollView
        contentContainerStyle={styles.scroll}
        scrollEnabled={!dragging}
      >
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
          <ProviderDragList
            stack={stack}
            busy={dragging}
            onDraggingChange={setDragging}
            onReorder={onReorder}
            onToggle={onToggle}
          />
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
  scroll: { padding: 24, gap: 12, paddingBottom: 48 },
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
});
