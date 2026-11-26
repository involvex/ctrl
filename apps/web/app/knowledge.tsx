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
  addLocalMemory,
  addLocalNote,
  assembleLocalContextPrefix,
  bytesToBase64,
  deleteLocalMemory,
  deleteLocalNote,
  downloadAttachmentBlob,
  getEmbeddingStatus,
  inspectContext,
  reindexKnowledge,
  searchKnowledge,
  searchLocalChunks,
  storeLocalNoteBlob,
  updateLocalMemory,
  updateLocalNote,
  updateMemory,
  type KnowledgeHit,
} from '@involvex/ctrl-i';
import type { KnowledgeSearchMode } from '@involvex/ctrl-s';
import { resolveConnectedWorkspace } from '../src/connection/workspace';
import { syncBrainWithGateway } from '../src/brain/sync';
import {
  loadBrain,
  saveBrain,
  type BrainMemory,
  type BrainState,
} from '../src/brain/store';

const SEARCH_MODES: KnowledgeSearchMode[] = ['hybrid', 'vector', 'fts'];

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
  const [embeddingLine, setEmbeddingLine] = useState<string | null>(null);

  const paired = Boolean(gatewayUrl && workspaceId);
  const memory: BrainMemory[] = (brain?.memory ?? []).filter(
    (m) => m.deletedAt == null
  );
  const notes = (brain?.notes ?? []).filter((n) => n.deletedAt == null);

  const persistBrain = useCallback(async (next: BrainState) => {
    setBrain(next);
    await saveBrain(next);
  }, []);

  const refreshLocal = useCallback((state: BrainState, q: string) => {
    if (q.trim()) {
      setHits(searchLocalChunks(state.chunks, q.trim()).map(hitFromLocal));
    } else {
      setHits([]);
    }
    const assembled = assembleLocalContextPrefix(state, q.trim() || ' ');
    setPreview(assembled || null);
    const noteCount = state.notes.filter((n) => n.deletedAt == null).length;
    const memCount = state.memory.filter((m) => m.deletedAt == null).length;
    setStatus(`local brain · ${noteCount} notes · ${memCount} memory`);
  }, []);

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
        if (embed) {
          setEmbeddingLine(
            embed.enabled
              ? `embeddings · ${embed.provider} · ${embed.indexedChunks}/${embed.totalChunks} indexed · dim ${embed.dims}`
              : 'embeddings · off'
          );
        }
        if (searchMode !== 'fts') {
          const ctx = await inspectContext(gatewayUrl, workspaceId, {
            conversationId: conversationId ?? undefined,
            q: query.trim() || undefined,
          });
          setPreview(ctx.assembledPreview);
          setStatus(`host · ${searchMode}`);
        }
      } else {
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
        if (!cancelled && embed) {
          setEmbeddingLine(
            embed.enabled
              ? `embeddings · ${embed.provider} · ${embed.indexedChunks}/${embed.totalChunks} indexed · dim ${embed.dims}`
              : 'embeddings · off'
          );
          setSearchMode('hybrid');
        }
      } catch {
        if (!cancelled) {
          setGatewayUrl(null);
          setWorkspaceId(null);
          setSearchMode('fts');
          setEmbeddingLine('offline · local fts only');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshLocal]);

  return (
    <ScrollView contentContainerStyle={styles.root}>
      <Pressable onPress={() => router.back()}>
        <Text style={styles.link}>← back</Text>
      </Pressable>
      <Text style={styles.title}>knowledge</Text>
      <Text style={styles.meta}>{status}</Text>
      {embeddingLine ? <Text style={styles.meta}>{embeddingLine}</Text> : null}
      <Text style={styles.label}>
        {editingNoteId ? 'edit note' : 'ingest note'}
      </Text>
      <TextInput
        style={styles.input}
        value={filename}
        onChangeText={setFilename}
        placeholder="filename"
        placeholderTextColor="#6b7f72"
      />
      <TextInput
        style={[styles.input, styles.tall]}
        value={draft}
        onChangeText={setDraft}
        placeholder="markdown…"
        placeholderTextColor="#6b7f72"
        multiline
      />
      <View style={styles.memActions}>
        <Pressable
          style={styles.button}
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
            <Text style={styles.ghostText}>cancel</Text>
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.label}>search mode</Text>
      <View style={styles.modeRow}>
        {(paired ? SEARCH_MODES : (['fts'] as const)).map((mode) => (
          <Pressable
            key={mode}
            style={[
              styles.modeBtn,
              searchMode === mode ? styles.modeBtnActive : null,
            ]}
            onPress={() => setSearchMode(mode)}
            disabled={busy}
          >
            <Text
              style={[
                styles.modeBtnText,
                searchMode === mode ? styles.modeBtnTextActive : null,
              ]}
            >
              {mode}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.label}>search</Text>
      <TextInput
        style={styles.input}
        value={query}
        onChangeText={setQuery}
        placeholder="query"
        placeholderTextColor="#6b7f72"
        onSubmitEditing={() => {
          void refresh();
        }}
      />
      <Pressable style={styles.button} onPress={() => void refresh()}>
        {busy ? (
          <ActivityIndicator color="#000" />
        ) : (
          <Text style={styles.buttonText}>refresh</Text>
        )}
      </Pressable>
      {paired ? (
        <Pressable
          style={styles.button}
          disabled={busy || !gatewayUrl || !workspaceId}
          onPress={() => {
            if (!gatewayUrl || !workspaceId) {
              return;
            }
            void (async () => {
              setBusy(true);
              try {
                const result = await reindexKnowledge(gatewayUrl, workspaceId, {
                  force: true,
                });
                setStatus(
                  `reindex · indexed ${result.indexed}/${result.totalChunks} · skipped ${result.skipped}`
                );
                await refresh();
              } catch (err) {
                setStatus(err instanceof Error ? err.message : String(err));
              } finally {
                setBusy(false);
              }
            })();
          }}
        >
          <Text style={styles.buttonText}>reindex embeddings</Text>
        </Pressable>
      ) : null}
      {hits.map((hit) => (
        <View key={hit.chunkId} style={styles.panel}>
          <Text style={styles.meta}>
            {hit.filename} · rank {hit.rank}
            {hit.score !== undefined
              ? ` · ${hit.source ?? 'hit'} ${hit.score.toFixed(3)}`
              : ''}
          </Text>
          <Text style={styles.body}>{hit.snippet}</Text>
        </View>
      ))}
      <Text style={styles.label}>
        {editingMemoryId ? 'edit memory' : 'memory'}
      </Text>
      <TextInput
        style={styles.input}
        value={memoryDraft}
        onChangeText={setMemoryDraft}
        placeholder="new memory"
        placeholderTextColor="#6b7f72"
      />
      <View style={styles.memActions}>
        <Pressable
          style={styles.button}
          disabled={busy || !memoryDraft.trim() || !brain}
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
            {editingMemoryId ? 'save edit' : 'add memory'}
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
            <Text style={styles.ghostText}>cancel</Text>
          </Pressable>
        ) : null}
      </View>
      {memory.map((item) => (
        <View key={item.id} style={styles.panel}>
          <Text style={styles.meta}>
            [{item.status}] {item.kind}
            {item.pinned ? ' ★' : ''}
            {item.origin === 'local' ? ' · local' : ''}
          </Text>
          <Text style={styles.body}>{item.content}</Text>
          <View style={styles.memActions}>
            <Pressable
              style={styles.ghostBtn}
              disabled={busy}
              onPress={() => {
                setEditingMemoryId(item.id);
                setMemoryDraft(item.content);
              }}
            >
              <Text style={styles.ghostText}>edit</Text>
            </Pressable>
            <Pressable
              style={styles.ghostBtn}
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
              <Text style={styles.ghostText}>delete</Text>
            </Pressable>
            {item.status === 'pending_review' &&
            paired &&
            gatewayUrl &&
            item.gatewayMemoryId ? (
              <Pressable
                style={styles.ghostBtn}
                onPress={() => {
                  void (async () => {
                    await updateMemory(gatewayUrl, item.gatewayMemoryId!, {
                      status: 'active',
                      pinned: true,
                    });
                    const synced = await syncBrainWithGateway(
                      brain ?? (await loadBrain())
                    );
                    if (synced.ok) {
                      await persistBrain(synced.brain);
                      refreshLocal(synced.brain, query);
                    }
                  })();
                }}
              >
                <Text style={styles.ghostText}>approve + pin</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ))}
      {notes.length > 0
        ? notes.slice(0, 12).map((note) => (
            <View key={note.id} style={styles.panel}>
              <Text style={styles.meta}>
                {note.filename}
                {note.origin === 'local' ? ' · local' : ' · synced'}
              </Text>
              <Text style={styles.body}>{note.text.slice(0, 160)}</Text>
              <View style={styles.memActions}>
                <Pressable
                  style={styles.ghostBtn}
                  disabled={busy}
                  onPress={() => {
                    setEditingNoteId(note.id);
                    setFilename(note.filename);
                    setDraft(note.text);
                  }}
                >
                  <Text style={styles.ghostText}>edit</Text>
                </Pressable>
                <Pressable
                  style={styles.ghostBtn}
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
                  <Text style={styles.ghostText}>delete</Text>
                </Pressable>
                {paired &&
                gatewayUrl &&
                note.gatewayAttachmentId &&
                !note.localBlobBase64 ? (
                  <Pressable
                    style={styles.ghostBtn}
                    disabled={busy || !brain}
                    onPress={() => {
                      if (!brain || !gatewayUrl) {
                        return;
                      }
                      const attachmentId = note.gatewayAttachmentId!;
                      const noteId = note.id;
                      void (async () => {
                        setBusy(true);
                        setStatus('downloading blob…');
                        try {
                          const blob = await downloadAttachmentBlob(
                            gatewayUrl,
                            attachmentId
                          );
                          const next = storeLocalNoteBlob(brain, noteId, {
                            base64: bytesToBase64(blob.bytes),
                            mimeType: blob.mimeType,
                            sizeBytes: blob.sizeBytes,
                            filename: blob.filename,
                          });
                          await persistBrain(next);
                          refreshLocal(next, query);
                          setStatus(`blob saved · ${blob.sizeBytes} B`);
                        } catch (error) {
                          setStatus(
                            error instanceof Error
                              ? error.message
                              : 'blob download failed'
                          );
                        } finally {
                          setBusy(false);
                        }
                      })();
                    }}
                  >
                    <Text style={styles.ghostText}>download blob</Text>
                  </Pressable>
                ) : null}
                {note.localBlobBase64 ? (
                  <Text style={styles.meta}>
                    blob local
                    {note.localBlobSizeBytes != null
                      ? ` · ${note.localBlobSizeBytes} B`
                      : ''}
                  </Text>
                ) : null}
              </View>
            </View>
          ))
        : null}
      {preview ? (
        <View style={styles.panel}>
          <Text style={styles.label}>context preview</Text>
          <Text style={styles.body}>{preview}</Text>
        </View>
      ) : null}
      <Pressable onPress={() => router.push('/tools')}>
        <Text style={styles.link}>tools / MCP →</Text>
      </Pressable>
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
  tall: { minHeight: 100, textAlignVertical: 'top' },
  button: {
    backgroundColor: '#00ff66',
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonText: { color: '#000', fontFamily: 'monospace', fontWeight: '700' },
  panel: {
    borderWidth: 1,
    borderColor: '#1f3328',
    padding: 12,
    backgroundColor: '#0a0f0c',
    gap: 4,
  },
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
  memActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  ghostBtn: {
    borderWidth: 1,
    borderColor: '#1f3328',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  ghostText: { color: '#00ff66', fontFamily: 'monospace', fontSize: 11 },
});
