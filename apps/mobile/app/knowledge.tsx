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
  createMemory,
  getEmbeddingStatus,
  inspectContext,
  listMemory,
  reindexKnowledge,
  searchKnowledge,
  updateMemory,
  uploadAttachmentText,
  type EmbeddingStatus,
  type KnowledgeHit,
  type KnowledgeSearchMode,
  type MemoryItem,
} from '@involvex/ctrl-i';
import { resolveConnectedWorkspace } from '../src/connection/workspace';

const SEARCH_MODE_OPTIONS: KnowledgeSearchMode[] = ['hybrid', 'vector', 'fts'];

function toKnowledgeSearchMode(value: string): KnowledgeSearchMode {
  if (value === 'vector' || value === 'fts') {
    return value;
  }
  return 'hybrid';
}

export default function KnowledgeScreen() {
  const router = useRouter();
  const [gatewayUrl, setGatewayUrl] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [filename, setFilename] = useState('notes.md');
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<KnowledgeHit[]>([]);
  const [memory, setMemory] = useState<MemoryItem[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [memoryDraft, setMemoryDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('loading…');
  const [searchMode, setSearchMode] = useState<KnowledgeSearchMode>('hybrid');
  const [embeddingStatus, setEmbeddingStatus] =
    useState<EmbeddingStatus | null>(null);

  const refresh = useCallback(async () => {
    if (!gatewayUrl || !workspaceId) {
      return;
    }
    setBusy(true);
    try {
      const [mem, embed] = await Promise.all([
        listMemory(gatewayUrl, workspaceId),
        getEmbeddingStatus(gatewayUrl, workspaceId).catch(() => null),
      ]);
      setMemory(mem);
      setEmbeddingStatus(embed);
      if (query.trim()) {
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
      const ctx = await inspectContext(gatewayUrl, workspaceId, {
        conversationId: conversationId ?? undefined,
        q: query.trim() || undefined,
      });
      setPreview(ctx.assembledPreview);
      setStatus('ok');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [conversationId, gatewayUrl, query, searchMode, workspaceId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const connected = await resolveConnectedWorkspace();
        if (cancelled) {
          return;
        }
        setGatewayUrl(connected.gatewayUrl);
        setWorkspaceId(connected.workspace.id);
        setConversationId(connected.conversationId);
        setStatus(`workspace · ${connected.workspace.name}`);
        setBusy(true);
        const [mem, embed] = await Promise.all([
          listMemory(connected.gatewayUrl, connected.workspace.id),
          getEmbeddingStatus(
            connected.gatewayUrl,
            connected.workspace.id
          ).catch(() => null),
        ]);
        if (cancelled) {
          return;
        }
        setMemory(mem);
        setEmbeddingStatus(embed);
        const ctx = await inspectContext(
          connected.gatewayUrl,
          connected.workspace.id,
          {
            conversationId: connected.conversationId ?? undefined,
          }
        );
        if (cancelled) {
          return;
        }
        setPreview(ctx.assembledPreview);
        setStatus('ok');
      } catch (err) {
        if (!cancelled) {
          setStatus(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) {
          setBusy(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
          {embeddingStatus
            ? embeddingStatus.enabled
              ? `embeddings · ${embeddingStatus.provider}/${embeddingStatus.model} · ${embeddingStatus.indexedChunks}/${embeddingStatus.totalChunks} indexed`
              : 'embeddings off (fts only)'
            : 'embeddings unknown'}
        </Text>

        <Text style={styles.label}>ingest note</Text>
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
        <Pressable
          style={[styles.button, busy && styles.buttonDisabled]}
          disabled={busy || !gatewayUrl || !workspaceId || !draft.trim()}
          onPress={() => {
            if (!gatewayUrl || !workspaceId) {
              return;
            }
            setBusy(true);
            void uploadAttachmentText(gatewayUrl, workspaceId, {
              filename: filename.trim() || 'notes.md',
              mimeType: 'text/markdown',
              text: draft,
              conversationId: conversationId ?? undefined,
            })
              .then(() => {
                setDraft('');
                return refresh();
              })
              .catch((err: unknown) => {
                setStatus(err instanceof Error ? err.message : String(err));
                setBusy(false);
              });
          }}
        >
          <Text style={styles.buttonText}>ingest</Text>
        </Pressable>

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

        <Text style={styles.label}>search / context</Text>
        <View style={styles.modeRow}>
          {SEARCH_MODE_OPTIONS.map((mode) => (
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

        <Text style={styles.label}>add memory</Text>
        <TextInput
          style={[styles.input, styles.tall]}
          value={memoryDraft}
          onChangeText={setMemoryDraft}
          placeholder="short memory fact…"
          placeholderTextColor="#6b7f72"
          multiline
        />
        <Pressable
          style={[styles.button, busy && styles.buttonDisabled]}
          disabled={busy || !gatewayUrl || !workspaceId || !memoryDraft.trim()}
          onPress={() => {
            if (!gatewayUrl || !workspaceId) {
              return;
            }
            setBusy(true);
            void createMemory(gatewayUrl, workspaceId, {
              content: memoryDraft.trim(),
              status: 'pending_review',
            })
              .then(() => {
                setMemoryDraft('');
                return refresh();
              })
              .catch((err: unknown) => {
                setStatus(err instanceof Error ? err.message : String(err));
                setBusy(false);
              });
          }}
        >
          <Text style={styles.buttonText}>save memory</Text>
        </Pressable>

        <Text style={styles.label}>memory review</Text>
        {busy && memory.length === 0 ? (
          <ActivityIndicator color="#00ff66" />
        ) : null}
        {memory.map((item) => (
          <View key={item.id} style={styles.panel}>
            <Text style={styles.meta}>
              [{item.status}] {item.kind}
              {item.pinned ? ' ★' : ''}
            </Text>
            <Text style={styles.bubbleText}>{item.content.slice(0, 240)}</Text>
            <View style={styles.row}>
              {item.status === 'pending_review' ? (
                <Pressable
                  onPress={() => {
                    if (!gatewayUrl) {
                      return;
                    }
                    void updateMemory(gatewayUrl, item.id, {
                      status: 'active',
                      pinned: true,
                    }).then(() => refresh());
                  }}
                >
                  <Text style={styles.link}>approve + pin</Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => {
                  if (!gatewayUrl) {
                    return;
                  }
                  void updateMemory(gatewayUrl, item.id, {
                    status: 'archived',
                  }).then(() => refresh());
                }}
              >
                <Text style={styles.link}>archive</Text>
              </Pressable>
            </View>
          </View>
        ))}
        {memory.length === 0 ? (
          <Text style={styles.meta}>no memory items yet</Text>
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
  row: { flexDirection: 'row', gap: 16 },
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
