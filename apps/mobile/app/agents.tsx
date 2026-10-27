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
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
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
import { GhostButton, PrimaryButton, Section, colors, fonts } from '../src/ui';

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
        <Text style={styles.title}>agents</Text>
        <Text style={styles.meta}>
          Mode and persona shape the system prompt for every generator.
        </Text>

        <Section title="PC sync">
          <Text style={styles.meta}>
            Round-trip personas with the paired gateway agent_profiles.
          </Text>
          <PrimaryButton label="sync personas" busy={busy} onPress={runSync} />
          <Text style={styles.meta}>{syncLine}</Text>
        </Section>

        <Section title="Mode">
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
        </Section>

        <Section title="Persona">
          <PrimaryButton
            label="new persona"
            busy={busy}
            onPress={openCreate}
            style={styles.newBtn}
          />
          {config.personas.map((persona) => (
            <View
              key={persona.id}
              style={[
                styles.card,
                config.activePersonaId === persona.id
                  ? styles.cardActive
                  : null,
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
                  <Text style={styles.linked}>linked · PC</Text>
                ) : null}
              </Pressable>
              <View style={styles.actions}>
                <GhostButton
                  label="edit"
                  disabled={busy}
                  onPress={() => {
                    openEdit(persona);
                  }}
                  style={styles.actionBtn}
                />
                {isPresetPersonaId(persona.id) ? (
                  <GhostButton
                    label="reset"
                    disabled={busy}
                    onPress={() => {
                      void persist(resetPersonaToPreset(config, persona.id));
                    }}
                    style={styles.actionBtn}
                  />
                ) : null}
                <GhostButton
                  label="delete"
                  disabled={busy || config.personas.length <= 1}
                  onPress={() => {
                    Alert.alert(
                      'Delete persona?',
                      `Remove “${persona.name}” from this phone. Sync later to update the PC.`,
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
                  style={styles.actionBtn}
                />
              </View>
            </View>
          ))}
        </Section>

        {editor.mode !== 'closed' ? (
          <Section
            title={editor.mode === 'create' ? 'New persona' : 'Edit persona'}
          >
            <Text style={styles.label}>name</Text>
            <TextInput
              style={styles.field}
              value={draftName}
              onChangeText={setDraftName}
              placeholder="Marketing expert"
              placeholderTextColor={colors.muted}
              editable={!busy}
            />
            <Text style={styles.label}>instructions</Text>
            <TextInput
              style={styles.rules}
              multiline
              value={draftInstructions}
              onChangeText={setDraftInstructions}
              placeholder="You are …"
              placeholderTextColor={colors.muted}
              editable={!busy}
            />
            <View style={styles.actions}>
              <PrimaryButton
                label="save"
                busy={busy}
                onPress={saveEditor}
                style={styles.flexBtn}
              />
              <GhostButton
                label="cancel"
                disabled={busy}
                onPress={closeEditor}
                style={styles.flexBtn}
              />
            </View>
          </Section>
        ) : null}

        <Section title="Custom rules">
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
            placeholder="Always cite sources · Prefer German · …"
            placeholderTextColor={colors.muted}
            editable={!busy}
          />
          <GhostButton
            label="Save rules"
            disabled={busy}
            onPress={() => {
              void persist(config);
            }}
          />
        </Section>
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
  label: {
    color: colors.muted,
    fontFamily: fonts.mono,
    fontSize: 11,
    marginTop: 4,
  },
  modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  modeChip: {
    borderWidth: 1,
    borderColor: colors.charcoal,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  modeChipActive: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(0, 255, 102, 0.08)',
  },
  modeChipText: {
    color: colors.accent,
    fontFamily: fonts.mono,
    fontWeight: '700',
    fontSize: 12,
  },
  newBtn: { marginBottom: 8 },
  card: {
    borderWidth: 1,
    borderColor: colors.charcoal,
    padding: 12,
    gap: 8,
    marginBottom: 8,
  },
  cardActive: { borderColor: colors.accent },
  cardTitle: {
    color: colors.accent,
    fontFamily: fonts.mono,
    fontWeight: '700',
    fontSize: 13,
  },
  linked: {
    color: colors.muted,
    fontFamily: fonts.mono,
    fontSize: 10,
    marginTop: 4,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actionBtn: { paddingHorizontal: 8, paddingVertical: 6 },
  flexBtn: { flexGrow: 1 },
  field: {
    borderWidth: 1,
    borderColor: colors.accent,
    color: colors.accent,
    fontFamily: fonts.mono,
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.field,
  },
  rules: {
    minHeight: 120,
    borderWidth: 1,
    borderColor: colors.accent,
    color: colors.accent,
    fontFamily: fonts.mono,
    fontSize: 12,
    padding: 12,
    textAlignVertical: 'top',
    backgroundColor: colors.field,
  },
});
