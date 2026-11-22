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
      <View style={styles.center}>
        <ActivityIndicator color="#00ff66" />
      </View>
    );
  }

  const items = listConversations(brain);

  return (
    <ScrollView contentContainerStyle={styles.root}>
      <Pressable onPress={() => router.back()}>
        <Text style={styles.link}>← back</Text>
      </Pressable>
      <Text style={styles.title}>conversations</Text>
      <Text style={styles.meta}>
        Local and host threads. Sync maps every conversation to its own gateway
        chat when online.
      </Text>

      <Pressable
        style={[styles.button, busy && styles.buttonDisabled]}
        disabled={busy}
        onPress={() => {
          void (async () => {
            const next = createLocalConversation(brain);
            await persist(next);
            router.push('/chat');
          })();
        }}
      >
        <Text style={styles.buttonText}>new chat</Text>
      </Pressable>

      <Text style={styles.section}>History</Text>
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
                  placeholderTextColor="#6b7f72"
                />
                <Pressable
                  style={styles.ghostBtn}
                  onPress={() => {
                    void (async () => {
                      await persist(
                        renameConversation(brain, c.id, renameDraft)
                      );
                      setRenamingId(null);
                    })();
                  }}
                >
                  <Text style={styles.ghostText}>save</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={() => {
                  void (async () => {
                    await persist(switchConversation(brain, c.id));
                    router.push('/chat');
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
              <Pressable
                style={styles.ghostBtn}
                onPress={() => {
                  setRenamingId(c.id);
                  setRenameDraft(c.title);
                }}
              >
                <Text style={styles.ghostText}>rename</Text>
              </Pressable>
              <Pressable
                style={styles.ghostBtn}
                disabled={brain.conversations.length <= 1}
                onPress={() => {
                  Alert.alert(
                    'Delete conversation?',
                    `Remove “${c.title}” and its messages locally.`,
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
              >
                <Text style={styles.ghostText}>delete</Text>
              </Pressable>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: '#000', justifyContent: 'center' },
  root: { padding: 24, gap: 10, backgroundColor: '#000', flexGrow: 1 },
  title: {
    color: '#00ff66',
    fontFamily: 'monospace',
    fontWeight: '700',
    fontSize: 22,
  },
  link: { color: '#00ff66', fontFamily: 'monospace' },
  section: {
    color: '#00ff66',
    fontFamily: 'monospace',
    fontWeight: '700',
    fontSize: 13,
    marginTop: 8,
  },
  meta: { color: '#6b7f72', fontFamily: 'monospace', fontSize: 12 },
  button: {
    backgroundColor: '#00ff66',
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#000', fontFamily: 'monospace', fontWeight: '700' },
  ghostBtn: {
    borderWidth: 1,
    borderColor: '#1f3328',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  ghostText: { color: '#00ff66', fontFamily: 'monospace', fontSize: 12 },
  card: {
    borderWidth: 1,
    borderColor: '#1f3328',
    padding: 12,
    gap: 8,
  },
  cardActive: {
    borderColor: '#00ff66',
    backgroundColor: 'rgba(0, 255, 102, 0.06)',
  },
  cardTitle: {
    color: '#00ff66',
    fontFamily: 'monospace',
    fontWeight: '700',
    fontSize: 14,
  },
  cardMeta: {
    color: '#6b7f72',
    fontFamily: 'monospace',
    fontSize: 11,
    marginTop: 4,
  },
  actions: { flexDirection: 'row', gap: 8 },
  renameRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  renameInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#00ff66',
    color: '#00ff66',
    fontFamily: 'monospace',
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#111613',
  },
});
