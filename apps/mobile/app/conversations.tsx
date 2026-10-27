import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  createLocalConversation,
  deleteConversation,
  listConversations,
  loadBrain,
  renameConversation,
  saveBrain,
  switchConversation,
  type BrainState,
} from '../src/brain/store';
import { GhostButton, PrimaryButton, Section, colors, fonts } from '../src/ui';

export default function ConversationsScreen() {
  const router = useRouter();
  const [brain, setBrain] = useState<BrainState | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const hydrate = useCallback(async () => {
    setBrain(await loadBrain());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void hydrate();
    }, [hydrate])
  );

  const persist = useCallback(async (next: BrainState) => {
    setBrain(next);
    setBusy(true);
    try {
      await saveBrain(next);
    } finally {
      setBusy(false);
    }
  }, []);

  if (!brain) {
    return (
      <SafeAreaView style={styles.root}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  const items = listConversations(brain);

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
        <Text style={styles.title}>conversations</Text>
        <Text style={styles.meta}>
          Local threads on this phone. Sync still maps the active one to the PC
          when online.
        </Text>

        <PrimaryButton
          label="new chat"
          busy={busy}
          onPress={() => {
            void (async () => {
              const next = createLocalConversation(brain);
              await persist(next);
              router.replace('/');
            })();
          }}
          style={styles.newBtn}
        />

        <Section title="History">
          {items.map((c) => {
            const active = c.id === brain.activeConversationId;
            const renaming = renamingId === c.id;
            return (
              <View
                key={c.id}
                style={[styles.card, active ? styles.cardActive : null]}
              >
                {renaming ? (
                  <View style={styles.renameRow}>
                    <TextInput
                      style={styles.renameInput}
                      value={renameDraft}
                      onChangeText={setRenameDraft}
                      placeholderTextColor={colors.muted}
                    />
                    <GhostButton
                      label="save"
                      onPress={() => {
                        void (async () => {
                          await persist(
                            renameConversation(brain, c.id, renameDraft)
                          );
                          setRenamingId(null);
                        })();
                      }}
                    />
                  </View>
                ) : (
                  <Pressable
                    onPress={() => {
                      void (async () => {
                        await persist(switchConversation(brain, c.id));
                        router.replace('/');
                      })();
                    }}
                  >
                    <Text style={styles.cardTitle}>{c.title}</Text>
                    <Text style={styles.cardMeta}>
                      {active ? 'active · ' : ''}
                      {new Date(c.updatedAt).toLocaleString()}
                    </Text>
                  </Pressable>
                )}
                <View style={styles.actions}>
                  <GhostButton
                    label="rename"
                    onPress={() => {
                      setRenamingId(c.id);
                      setRenameDraft(c.title);
                    }}
                    style={styles.actionBtn}
                  />
                  <GhostButton
                    label="delete"
                    disabled={brain.conversations.length <= 1}
                    onPress={() => {
                      Alert.alert(
                        'Delete conversation?',
                        `Remove “${c.title}” and its messages on this phone.`,
                        [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Delete',
                            style: 'destructive',
                            onPress: () => {
                              void persist(deleteConversation(brain, c.id));
                            },
                          },
                        ]
                      );
                    }}
                    style={styles.actionBtn}
                  />
                </View>
              </View>
            );
          })}
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 16, paddingBottom: 48, gap: 12 },
  back: { alignSelf: 'flex-start' },
  title: {
    color: colors.accent,
    fontFamily: fonts.mono,
    fontWeight: '700',
    fontSize: 22,
  },
  meta: {
    color: colors.muted,
    fontFamily: fonts.mono,
    fontSize: 12,
    marginBottom: 8,
  },
  newBtn: { marginBottom: 8 },
  card: {
    borderWidth: 1,
    borderColor: colors.charcoal,
    padding: 12,
    gap: 8,
    marginBottom: 8,
  },
  cardActive: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(0, 255, 102, 0.06)',
  },
  cardTitle: {
    color: colors.accent,
    fontFamily: fonts.mono,
    fontWeight: '700',
    fontSize: 14,
  },
  cardMeta: {
    color: colors.muted,
    fontFamily: fonts.mono,
    fontSize: 11,
    marginTop: 4,
  },
  actions: { flexDirection: 'row', gap: 8 },
  actionBtn: { paddingHorizontal: 8, paddingVertical: 6 },
  renameRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  renameInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.accent,
    color: colors.accent,
    fontFamily: fonts.mono,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: colors.field,
  },
});
