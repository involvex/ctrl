import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
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
  buildSystemPrompt,
  createPersona,
  deletePersona,
  isPresetPersonaId,
  loadAgentConfig,
  modeLabel,
  resetPersonaToPreset,
  saveAgentConfig,
  updatePersona,
  type AgentConfig,
  type AgentMode,
  type AgentPersona,
} from '../src/agents/config';
import { syncAgentProfilesWithGateway } from '../src/agents/sync';
import { loadBrain, saveBrain, setBrainPersona } from '../src/brain/store';

const MODES: AgentMode[] = ['ask', 'plan', 'auto'];

type EditorState =
  | { mode: 'closed' }
  | { mode: 'create' }
  | { mode: 'edit'; persona: AgentPersona };

export default function AgentsScreen() {
  const router = useRouter();
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [syncLine, setSyncLine] = useState('sync · idle');
  const [editor, setEditor] = useState<EditorState>({ mode: 'closed' });
  const [draftName, setDraftName] = useState('');
  const [draftInstructions, setDraftInstructions] = useState('');

  useEffect(() => {
    void (async () => {
      setConfig(await loadAgentConfig());
    })();
  }, []);

  const persist = useCallback(async (next: AgentConfig) => {
    setConfig(next);
    setBusy(true);
    try {
      await saveAgentConfig(next);
      const brain = await loadBrain();
      await saveBrain(setBrainPersona(brain, buildSystemPrompt(next)));
    } finally {
      setBusy(false);
    }
  }, []);

  const openCreate = useCallback(() => {
    setDraftName('');
    setDraftInstructions('');
    setEditor({ mode: 'create' });
  }, []);

  const openEdit = useCallback((persona: AgentPersona) => {
    setDraftName(persona.name);
    setDraftInstructions(persona.instructions);
    setEditor({ mode: 'edit', persona });
  }, []);

  const closeEditor = useCallback(() => {
    setEditor({ mode: 'closed' });
  }, []);

  const saveEditor = useCallback(() => {
    if (!config || busy) {
      return;
    }
    void (async () => {
      if (editor.mode === 'create') {
        await persist(
          createPersona(config, {
            name: draftName,
            instructions: draftInstructions,
          })
        );
        closeEditor();
        return;
      }
      if (editor.mode === 'edit') {
        await persist(
          updatePersona(config, editor.persona.id, {
            name: draftName,
            instructions: draftInstructions,
          })
        );
        closeEditor();
      }
    })();
  }, [
    busy,
    closeEditor,
    config,
    draftInstructions,
    draftName,
    editor,
    persist,
  ]);

  const runSync = useCallback(() => {
    if (!config || busy) {
      return;
    }
    setBusy(true);
    setSyncLine('sync · running…');
    void (async () => {
      try {
        const result = await syncAgentProfilesWithGateway(config);
        if (result.ok) {
          setConfig(result.config);
          const brain = await loadBrain();
          await saveBrain(
            setBrainPersona(brain, buildSystemPrompt(result.config))
          );
          setSyncLine(
            `sync · ok · +${result.pulled} pulled · +${result.pushed} pushed`
          );
        } else {
          setSyncLine(`sync · skipped · ${result.reason}`);
        }
      } finally {
        setBusy(false);
      }
    })();
  }, [busy, config]);

  if (!config) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#00ff66" />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.root}>
      <Pressable onPress={() => router.back()}>
        <Text style={styles.link}>← back</Text>
      </Pressable>
      <Text style={styles.title}>agents</Text>
      <Text style={styles.meta}>
        Mode and persona shape the system prompt for every generator.
      </Text>

      <Text style={styles.section}>PC sync</Text>
      <Text style={styles.meta}>
        Round-trip personas with the paired gateway agent_profiles.
      </Text>
      <Pressable
        style={[styles.button, busy && styles.buttonDisabled]}
        disabled={busy}
        onPress={runSync}
      >
        <Text style={styles.buttonText}>sync personas</Text>
      </Pressable>
      <Text style={styles.meta}>{syncLine}</Text>

      <Text style={styles.section}>Mode</Text>
      <View style={styles.modeRow}>
        {MODES.map((mode) => (
          <Pressable
            key={mode}
            style={[
              styles.modeChip,
              config.mode === mode ? styles.modeChipActive : null,
            ]}
            disabled={busy}
            onPress={() => {
              void persist({ ...config, mode });
            }}
          >
            <Text style={styles.modeChipText}>{modeLabel(mode)}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.meta}>
        Ask = answer only · Plan = outline first · Auto = act toward goal
      </Text>

      <Text style={styles.section}>Persona</Text>
      <Pressable style={styles.button} disabled={busy} onPress={openCreate}>
        <Text style={styles.buttonText}>new persona</Text>
      </Pressable>
      {config.personas.map((persona) => (
        <View
          key={persona.id}
          style={[
            styles.card,
            config.activePersonaId === persona.id ? styles.cardActive : null,
          ]}
        >
          <Pressable
            disabled={busy}
            onPress={() => {
              void persist({ ...config, activePersonaId: persona.id });
            }}
          >
            <Text style={styles.cardTitle}>{persona.name}</Text>
            <Text style={styles.meta} numberOfLines={3}>
              {persona.instructions}
            </Text>
            {persona.gatewayProfileId ? (
              <Text style={styles.linked}>linked · gateway</Text>
            ) : null}
          </Pressable>
          <View style={styles.actions}>
            <Pressable
              style={styles.ghostBtn}
              disabled={busy}
              onPress={() => openEdit(persona)}
            >
              <Text style={styles.ghostText}>edit</Text>
            </Pressable>
            {isPresetPersonaId(persona.id) ? (
              <Pressable
                style={styles.ghostBtn}
                disabled={busy}
                onPress={() => {
                  void persist(resetPersonaToPreset(config, persona.id));
                }}
              >
                <Text style={styles.ghostText}>reset</Text>
              </Pressable>
            ) : null}
            <Pressable
              style={styles.ghostBtn}
              disabled={busy || config.personas.length <= 1}
              onPress={() => {
                Alert.alert(
                  'Delete persona?',
                  `Remove “${persona.name}” locally. Sync later to update the host.`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Delete',
                      style: 'destructive',
                      onPress: () => {
                        void persist(deletePersona(config, persona.id));
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
      ))}

      {editor.mode !== 'closed' ? (
        <View style={styles.editor}>
          <Text style={styles.section}>
            {editor.mode === 'create' ? 'New persona' : 'Edit persona'}
          </Text>
          <Text style={styles.label}>name</Text>
          <TextInput
            style={styles.field}
            value={draftName}
            onChangeText={setDraftName}
            placeholder="Marketing expert"
            placeholderTextColor="#6b7f72"
            editable={!busy}
          />
          <Text style={styles.label}>instructions</Text>
          <TextInput
            style={styles.rules}
            multiline
            value={draftInstructions}
            onChangeText={setDraftInstructions}
            placeholder="You are …"
            placeholderTextColor="#6b7f72"
            editable={!busy}
          />
          <View style={styles.actions}>
            <Pressable
              style={styles.button}
              disabled={busy}
              onPress={saveEditor}
            >
              <Text style={styles.buttonText}>save</Text>
            </Pressable>
            <Pressable
              style={styles.ghostBtn}
              disabled={busy}
              onPress={closeEditor}
            >
              <Text style={styles.ghostText}>cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <Text style={styles.section}>Custom rules</Text>
      <TextInput
        style={styles.rules}
        multiline
        value={config.rules}
        onChangeText={(rules) => {
          setConfig({ ...config, rules });
        }}
        onEndEditing={() => {
          void persist(config);
        }}
        placeholder="Always cite sources · …"
        placeholderTextColor="#6b7f72"
        editable={!busy}
      />
      <Pressable
        style={styles.ghostBtn}
        disabled={busy}
        onPress={() => {
          void persist(config);
        }}
      >
        <Text style={styles.ghostText}>save rules</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: '#000', justifyContent: 'center' },
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
    fontSize: 13,
    fontWeight: '700',
    marginTop: 8,
  },
  meta: { color: '#6b7f72', fontFamily: 'monospace', fontSize: 12 },
  label: {
    color: '#6b7f72',
    fontFamily: 'monospace',
    fontSize: 11,
  },
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
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignSelf: 'flex-start',
  },
  ghostText: { color: '#00ff66', fontFamily: 'monospace', fontSize: 12 },
  modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  modeChip: {
    borderWidth: 1,
    borderColor: '#1f3328',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  modeChipActive: {
    borderColor: '#00ff66',
    backgroundColor: 'rgba(0, 255, 102, 0.08)',
  },
  modeChipText: {
    color: '#00ff66',
    fontFamily: 'monospace',
    fontWeight: '700',
    fontSize: 12,
  },
  card: {
    borderWidth: 1,
    borderColor: '#1f3328',
    padding: 12,
    gap: 8,
  },
  cardActive: { borderColor: '#00ff66' },
  cardTitle: {
    color: '#00ff66',
    fontFamily: 'monospace',
    fontWeight: '700',
    fontSize: 13,
  },
  linked: {
    color: '#6b7f72',
    fontFamily: 'monospace',
    fontSize: 10,
    marginTop: 4,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  field: {
    borderWidth: 1,
    borderColor: '#00ff66',
    color: '#00ff66',
    fontFamily: 'monospace',
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#111613',
  },
  rules: {
    minHeight: 120,
    borderWidth: 1,
    borderColor: '#00ff66',
    color: '#00ff66',
    fontFamily: 'monospace',
    fontSize: 12,
    padding: 12,
    textAlignVertical: 'top',
    backgroundColor: '#111613',
  },
  editor: { gap: 8 },
});
