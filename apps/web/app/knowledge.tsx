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
  createMemory,
  inspectContext,
  listMemory,
  searchKnowledge,
  uploadAttachmentText,
  type KnowledgeHit,
  type MemoryItem,
} from '@involvex/ctrl-i';
import { resolveConnectedWorkspace } from '../src/connection/workspace';

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

  const refresh = useCallback(async () => {
    if (!gatewayUrl || !workspaceId) {
      return;
    }
    setBusy(true);
    try {
      setMemory(await listMemory(gatewayUrl, workspaceId));
      if (query.trim()) {
        setHits(await searchKnowledge(gatewayUrl, workspaceId, query.trim()));
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
  }, [conversationId, gatewayUrl, query, workspaceId]);

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
        setStatus(`ok · ${connected.workspace.name}`);
        setBusy(true);
        try {
          setMemory(
            await listMemory(connected.gatewayUrl, connected.workspace.id)
          );
          const ctx = await inspectContext(
            connected.gatewayUrl,
            connected.workspace.id,
            {
              conversationId: connected.conversationId ?? undefined,
            }
          );
          if (!cancelled) {
            setPreview(ctx.assembledPreview);
          }
        } finally {
          if (!cancelled) {
            setBusy(false);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setStatus(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.root}>
      <Pressable onPress={() => router.back()}>
        <Text style={styles.link}>← back</Text>
      </Pressable>
      <Text style={styles.title}>knowledge</Text>
      <Text style={styles.meta}>{status}</Text>
      <Text style={styles.label}>ingest note</Text>
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
      <Pressable
        style={styles.button}
        disabled={busy || !draft.trim()}
        onPress={() => {
          if (!gatewayUrl || !workspaceId || !draft.trim()) {
            return;
          }
          void (async () => {
            setBusy(true);
            try {
              await uploadAttachmentText(gatewayUrl, workspaceId, {
                filename: filename.trim() || 'notes.md',
                mimeType: 'text/markdown',
                text: draft,
                conversationId: conversationId ?? undefined,
              });
              setDraft('');
              await refresh();
            } catch (err) {
              setStatus(err instanceof Error ? err.message : String(err));
            } finally {
              setBusy(false);
            }
          })();
        }}
      >
        <Text style={styles.buttonText}>upload</Text>
      </Pressable>
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
      {hits.map((hit) => (
        <View key={hit.chunkId} style={styles.panel}>
          <Text style={styles.meta}>
            {hit.filename} · rank {hit.rank}
          </Text>
          <Text style={styles.body}>{hit.snippet}</Text>
        </View>
      ))}
      <Text style={styles.label}>memory</Text>
      <TextInput
        style={styles.input}
        value={memoryDraft}
        onChangeText={setMemoryDraft}
        placeholder="new memory"
        placeholderTextColor="#6b7f72"
      />
      <Pressable
        style={styles.button}
        disabled={!memoryDraft.trim() || !gatewayUrl || !workspaceId}
        onPress={() => {
          if (!gatewayUrl || !workspaceId || !memoryDraft.trim()) {
            return;
          }
          void (async () => {
            await createMemory(gatewayUrl, workspaceId, {
              content: memoryDraft.trim(),
            });
            setMemoryDraft('');
            await refresh();
          })();
        }}
      >
        <Text style={styles.buttonText}>add memory</Text>
      </Pressable>
      {memory.map((item) => (
        <View key={item.id} style={styles.panel}>
          <Text style={styles.body}>{item.content}</Text>
        </View>
      ))}
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
});
