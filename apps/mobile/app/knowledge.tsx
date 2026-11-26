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
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  addLocalMemory,
  addLocalNote,
  assembleLocalContextPrefix,
  deleteLocalMemory,
  deleteLocalNote,
  getEmbeddingStatus,
  inspectContext,
  reindexKnowledge,
  searchKnowledge,
  searchLocalChunks,
  updateLocalMemory,
  updateLocalNote,
  updateMemory,
  type EmbeddingStatus,
  type KnowledgeHit,
  type KnowledgeSearchMode,
} from '@involvex/ctrl-i';
import { resolveConnectedWorkspace } from '../src/connection/workspace';
import { syncBrainWithGateway } from '../src/brain/sync';
import {
  loadBrain,
  saveBrain,
  type BrainMemory,
  type BrainState,
} from '../src/brain/store';

const SEARCH_MODE_OPTIONS: KnowledgeSearchMode[] = ['hybrid', 'vector', 'fts'];

function toKnowledgeSearchMode(value: string): KnowledgeSearchMode {
  if (value === 'vector' || value === 'fts') {
    return value;
  }
  return 'hybrid';
}

function hitFromLocal(hit: {
  chunkId: string;
  filename: string;
  snippet: string;
  score: number;
  source: 'fts';
}): KnowledgeHit {
  return {
    chunkId: hit.chunkId,
    attachmentId: hit.chunkId,
    workspaceId: 'local',
    filename: hit.filename,
    snippet: hit.snippet,
    rank: -hit.score,
    score: hit.score,
    source: 'fts',
  };
}

export default function KnowledgeScreen() {
  const router = useRouter();
  const [brain, setBrain] = useState<BrainState | null>(null);
  const [gatewayUrl, setGatewayUrl] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [filename, setFilename] = useState('notes.md');
  const [draft, setDraft] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<KnowledgeHit[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [memoryDraft, setMemoryDraft] = useState('');
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('loading…');
  const [searchMode, setSearchMode] = useState<KnowledgeSearchMode>('fts');
  const [embeddingStatus, setEmbeddingStatus] =
    useState<EmbeddingStatus | null>(null);

  const paired = Boolean(gatewayUrl && workspaceId);
  const memory: BrainMemory[] = (brain?.memory ?? []).filter(
    (m) => m.deletedAt == null
  );
  const notes = (brain?.notes ?? []).filter((n) => n.deletedAt == null);

  const persistBrain = useCallback(async (next: BrainState) => {
    setBrain(next);
    await saveBrain(next);
  }, []);

  const refreshLocal = useCallback(
    (state: BrainState, q: string) => {
      if (q.trim()) {
        setHits(searchLocalChunks(state.chunks, q.trim()).map(hitFromLocal));
      } else {
        setHits([]);
      }
      const assembled = assembleLocalContextPrefix(state, q.trim() || ' ');
      setPreview(assembled || null);
      const noteCount = state.notes.filter((n) => n.deletedAt == null).length;
      const memCount = state.memory.filter((m) => m.deletedAt == null).length;
      setStatus(
        paired
          ? `local + host · ${noteCount} notes · ${memCount} memory`
          : `local brain · ${noteCount} notes · ${memCount} memory`
      );
    },
    [paired]
  );

  const applyBrainMutation = useCallback(
    async (
      mutate: (state: BrainState) => BrainState,
      okStatus: string
    ): Promise<boolean> => {
      if (!brain) {
        return false;
      }
      setBusy(true);
      try {
        let next = mutate(brain);
        await persistBrain(next);
        if (paired) {
          const synced = await syncBrainWithGateway(next);
          if (synced.ok) {
            next = synced.brain;
            await persistBrain(next);
          }
        }
        refreshLocal(next, query);
        setStatus(okStatus);
        return true;
      } catch (err) {
        setStatus(err instanceof Error ? err.message : String(err));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [brain, paired, persistBrain, query, refreshLocal]
  );

  const refresh = useCallback(async () => {
    const state = brain ?? (await loadBrain());
    setBusy(true);
    try {
      if (paired && gatewayUrl && workspaceId) {
        if (searchMode === 'fts') {
          refreshLocal(state, query);
        } else if (query.trim()) {
          setHits(
            await searchKnowledge(
              gatewayUrl,
              workspaceId,
              query.trim(),
              undefined,
              searchMode
            )
          );
        } else {
          setHits([]);
        }
        const embed = await getEmbeddingStatus(gatewayUrl, workspaceId).catch(
          () => null
        );
        setEmbeddingStatus(embed);
        if (searchMode !== 'fts') {
          const ctx = await inspectContext(gatewayUrl, workspaceId, {
            conversationId: conversationId ?? undefined,
            q: query.trim() || undefined,
          });
          setPreview(ctx.assembledPreview);
          setStatus(`host · ${searchMode}`);
        }
      } else {
        setEmbeddingStatus(null);
        refreshLocal(state, query);
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [
    brain,
    conversationId,
    gatewayUrl,
    paired,
    query,
    refreshLocal,
    searchMode,
    workspaceId,
  ]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const loaded = await loadBrain();
      if (cancelled) {
        return;
      }
      setBrain(loaded);
      refreshLocal(loaded, '');
      try {
        const connected = await resolveConnectedWorkspace();
        if (cancelled) {
          return;
        }
        setGatewayUrl(connected.gatewayUrl);
        setWorkspaceId(connected.workspace.id);
        setConversationId(connected.conversationId);
        const synced = await syncBrainWithGateway(loaded);
        if (!cancelled && synced.ok) {
          setBrain(synced.brain);
          refreshLocal(synced.brain, '');
        }
        const embed = await getEmbeddingStatus(
          connected.gatewayUrl,
          connected.workspace.id
        ).catch(() => null);
        if (!cancelled) {
          setEmbeddingStatus(embed);
          setSearchMode('hybrid');
        }
      } catch {
        if (!cancelled) {
          setGatewayUrl(null);
          setWorkspaceId(null);
          setSearchMode('fts');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshLocal]);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable onPress={() => router.back()}>
          <Text style={styles.link}>← back</Text>
        </Pressable>
        <Text style={styles.title}>knowledge</Text>
        <Text style={styles.meta}>{status}</Text>
        <Text style={styles.meta}>
          {paired
            ? embeddingStatus
              ? embeddingStatus.enabled
                ? `embeddings · ${embeddingStatus.provider}/${embeddingStatus.model} · ${embeddingStatus.indexedChunks}/${embeddingStatus.totalChunks} indexed`
                : 'embeddings off (fts only)'
              : 'embeddings unknown'
            : 'offline · local fts only (pair for vector/hybrid)'}
        </Text>

        <Text style={styles.label}>
          {editingNoteId ? 'edit note' : 'ingest note'}
        </Text>
        <TextInput
          style={styles.input}
          value={filename}
          onChangeText={setFilename}
          placeholder="filename.md"
          placeholderTextColor="#6b7f72"
          autoCapitalize="none"
        />
        <TextInput
          style={[styles.input, styles.tall]}
          value={draft}
          onChangeText={setDraft}
          placeholder="paste markdown / notes…"
          placeholderTextColor="#6b7f72"
          multiline
        />
        <View style={styles.row}>
          <Pressable
            style={[
              styles.button,
              styles.flexBtn,
              busy && styles.buttonDisabled,
            ]}
            disabled={busy || !draft.trim() || !brain}
            onPress={() => {
              if (!brain || !draft.trim()) {
                return;
              }
              const noteId = editingNoteId;
              void applyBrainMutation(
                (state) =>
                  noteId
                    ? updateLocalNote(state, noteId, {
                        filename: filename.trim() || 'notes.md',
                        text: draft,
                      })
                    : addLocalNote(state, {
                        filename: filename.trim() || 'notes.md',
                        text: draft,
                      }),
                noteId ? 'note updated' : 'note saved'
              ).then((ok) => {
                if (!ok) {
                  return;
                }
                setDraft('');
                setEditingNoteId(null);
                setFilename('notes.md');
              });
            }}
          >
            <Text style={styles.buttonText}>
              {editingNoteId ? 'save edit' : 'ingest'}
            </Text>
          </Pressable>
          {editingNoteId ? (
            <Pressable
              style={styles.ghostBtn}
              disabled={busy}
              onPress={() => {
                setEditingNoteId(null);
                setDraft('');
                setFilename('notes.md');
              }}
            >
              <Text style={styles.link}>cancel</Text>
            </Pressable>
          ) : null}
        </View>

        {paired ? (
          <Pressable
            style={[styles.ghost, busy && styles.buttonDisabled]}
            disabled={busy || !gatewayUrl || !workspaceId}
            onPress={() => {
              if (!gatewayUrl || !workspaceId) {
                return;
              }
              setBusy(true);
              void reindexKnowledge(gatewayUrl, workspaceId, { force: true })
                .then((result) => {
                  setStatus(
                    `reindex · indexed ${result.indexed}/${result.totalChunks} · skipped ${result.skipped}`
                  );
                  return refresh();
                })
                .catch((err: unknown) => {
                  setStatus(err instanceof Error ? err.message : String(err));
                  setBusy(false);
                });
            }}
          >
            <Text style={styles.link}>
              {busy ? '…' : 'reindex embeddings (force)'}
            </Text>
          </Pressable>
        ) : null}

        <Text style={styles.label}>search / context</Text>
        <View style={styles.modeRow}>
          {(paired ? SEARCH_MODE_OPTIONS : (['fts'] as const)).map((mode) => (
            <Pressable
              key={mode}
              style={[
                styles.modeBtn,
                searchMode === mode && styles.modeBtnActive,
              ]}
              onPress={() => setSearchMode(toKnowledgeSearchMode(mode))}
              disabled={busy}
            >
              <Text
                style={[
                  styles.modeBtnText,
                  searchMode === mode && styles.modeBtnTextActive,
                ]}
              >
                {mode}
              </Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder="query…"
          placeholderTextColor="#6b7f72"
          autoCapitalize="none"
        />
        <Pressable
          style={styles.ghost}
          onPress={() => {
            void refresh();
          }}
        >
          <Text style={styles.link}>
            {busy ? '…' : 'search / inspect context'}
          </Text>
        </Pressable>
        {hits.map((hit) => (
          <View key={hit.chunkId} style={styles.panel}>
            <Text style={styles.meta}>
              <Text style={styles.emphasis}>{hit.filename}</Text>
              {hit.score !== undefined
                ? ` [${hit.source ?? 'hit'} ${hit.score.toFixed(3)}]`
                : ''}{' '}
              — {hit.snippet}
            </Text>
          </View>
        ))}
        {preview ? (
          <View style={styles.panel}>
            <Text style={styles.label}>context preview</Text>
            <Text style={styles.meta}>{preview.slice(0, 1200)}</Text>
          </View>
        ) : null}

        <Text style={styles.label}>
          {editingMemoryId ? 'edit memory' : 'add memory'}
        </Text>
        <TextInput
          style={[styles.input, styles.tall]}
          value={memoryDraft}
          onChangeText={setMemoryDraft}
          placeholder="short memory fact…"
          placeholderTextColor="#6b7f72"
          multiline
        />
        <View style={styles.row}>
          <Pressable
            style={[
              styles.button,
              styles.flexBtn,
              busy && styles.buttonDisabled,
            ]}
            disabled={busy || !brain || !memoryDraft.trim()}
            onPress={() => {
              if (!brain || !memoryDraft.trim()) {
                return;
              }
              const memoryId = editingMemoryId;
              void applyBrainMutation(
                (state) =>
                  memoryId
                    ? updateLocalMemory(state, memoryId, {
                        content: memoryDraft.trim(),
                      })
                    : addLocalMemory(state, {
                        content: memoryDraft.trim(),
                        pinned: true,
                        status: 'active',
                      }),
                memoryId ? 'memory updated' : 'memory saved'
              ).then((ok) => {
                if (!ok) {
                  return;
                }
                setMemoryDraft('');
                setEditingMemoryId(null);
              });
            }}
          >
            <Text style={styles.buttonText}>
              {editingMemoryId ? 'save edit' : 'save memory'}
            </Text>
          </Pressable>
          {editingMemoryId ? (
            <Pressable
              style={styles.ghostBtn}
              disabled={busy}
              onPress={() => {
                setEditingMemoryId(null);
                setMemoryDraft('');
              }}
            >
              <Text style={styles.link}>cancel</Text>
            </Pressable>
          ) : null}
        </View>

        <Text style={styles.label}>memory review</Text>
        {busy && memory.length === 0 ? (
          <ActivityIndicator color="#00ff66" />
        ) : null}
        {memory.map((item) => (
          <View key={item.id} style={styles.panel}>
            <Text style={styles.meta}>
              [{item.status}] {item.kind}
              {item.pinned ? ' ★' : ''}
              {item.origin === 'local' ? ' · local' : ''}
            </Text>
            <Text style={styles.bubbleText}>{item.content.slice(0, 240)}</Text>
            <View style={styles.row}>
              <Pressable
                disabled={busy}
                onPress={() => {
                  setEditingMemoryId(item.id);
                  setMemoryDraft(item.content);
                }}
              >
                <Text style={styles.link}>edit</Text>
              </Pressable>
              <Pressable
                disabled={busy}
                onPress={() => {
                  void applyBrainMutation(
                    (state) => deleteLocalMemory(state, item.id),
                    'memory deleted'
                  ).then(() => {
                    if (editingMemoryId === item.id) {
                      setEditingMemoryId(null);
                      setMemoryDraft('');
                    }
                  });
                }}
              >
                <Text style={styles.link}>delete</Text>
              </Pressable>
              {item.status === 'pending_review' &&
              paired &&
              gatewayUrl &&
              item.gatewayMemoryId ? (
                <Pressable
                  onPress={() => {
                    void updateMemory(gatewayUrl, item.gatewayMemoryId!, {
                      status: 'active',
                      pinned: true,
                    }).then(async () => {
                      const synced = await syncBrainWithGateway(
                        brain ?? (await loadBrain())
                      );
                      if (synced.ok) {
                        await persistBrain(synced.brain);
                        refreshLocal(synced.brain, query);
                      }
                      return undefined;
                    });
                  }}
                >
                  <Text style={styles.link}>approve + pin</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ))}
        {memory.length === 0 ? (
          <Text style={styles.meta}>no memory items yet</Text>
        ) : null}

        {notes.length > 0 ? (
          <>
            <Text style={styles.label}>local notes</Text>
            {notes.slice(0, 12).map((note) => (
              <View key={note.id} style={styles.panel}>
                <Text style={styles.meta}>
                  <Text style={styles.emphasis}>{note.filename}</Text>
                  {note.origin === 'local' ? ' · local' : ' · synced'}
                </Text>
                <Text style={styles.bubbleText}>{note.text.slice(0, 160)}</Text>
                <View style={styles.row}>
                  <Pressable
                    disabled={busy}
                    onPress={() => {
                      setEditingNoteId(note.id);
                      setFilename(note.filename);
                      setDraft(note.text);
                    }}
                  >
                    <Text style={styles.link}>edit</Text>
                  </Pressable>
                  <Pressable
                    disabled={busy}
                    onPress={() => {
                      void applyBrainMutation(
                        (state) => deleteLocalNote(state, note.id),
                        'note deleted'
                      ).then(() => {
                        if (editingNoteId === note.id) {
                          setEditingNoteId(null);
                          setDraft('');
                          setFilename('notes.md');
                        }
                      });
                    }}
                  >
                    <Text style={styles.link}>delete</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </>
        ) : null}

        <Pressable onPress={() => router.push('/tools')}>
          <Text style={styles.link}>tools / MCP →</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/chat')}>
          <Text style={styles.link}>chat →</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  scroll: { padding: 24, gap: 10 },
  title: {
    color: '#00ff66',
    fontFamily: 'monospace',
    fontSize: 22,
    fontWeight: '700',
  },
  link: { color: '#00ff66', fontFamily: 'monospace' },
  label: {
    color: '#00ff66',
    fontFamily: 'monospace',
    fontSize: 12,
    marginTop: 8,
  },
  meta: {
    color: '#6b7f72',
    fontFamily: 'monospace',
    fontSize: 12,
    lineHeight: 18,
  },
  emphasis: { color: '#00ff66' },
  input: {
    borderWidth: 1,
    borderColor: '#00ff66',
    color: '#00ff66',
    fontFamily: 'monospace',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#111613',
  },
  tall: { minHeight: 96, textAlignVertical: 'top' },
  button: {
    backgroundColor: '#00ff66',
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: {
    color: '#000',
    fontFamily: 'monospace',
    fontWeight: '700',
  },
  ghost: { paddingVertical: 6 },
  panel: {
    borderWidth: 1,
    borderColor: '#1f3328',
    backgroundColor: '#0a0f0c',
    padding: 12,
    gap: 6,
  },
  bubbleText: {
    color: '#00ff66',
    fontFamily: 'monospace',
    fontSize: 12,
    lineHeight: 17,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
  },
  flexBtn: { flex: 1 },
  ghostBtn: { paddingVertical: 10, paddingHorizontal: 4 },
  modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  modeBtn: {
    borderWidth: 1,
    borderColor: '#00ff66',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  modeBtnActive: { backgroundColor: '#00ff66' },
  modeBtnText: { color: '#00ff66', fontFamily: 'monospace', fontSize: 12 },
  modeBtnTextActive: { color: '#000', fontWeight: '700' },
});
