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
  buildSystemPrompt,
  loadAgentConfig,
  modeLabel,
  saveAgentConfig,
  type AgentConfig,
  type AgentMode,
} from '../src/agents/config';
import { loadBrain, saveBrain, setBrainPersona } from '../src/brain/store';
import { GhostButton, Section, colors, fonts } from '../src/ui';

const MODES: AgentMode[] = ['ask', 'plan', 'auto'];

export default function AgentsScreen() {
  const router = useRouter();
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [busy, setBusy] = useState(false);

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
          {config.personas.map((persona) => (
            <Pressable
              key={persona.id}
              style={[
                styles.card,
                config.activePersonaId === persona.id
                  ? styles.cardActive
                  : null,
              ]}
              disabled={busy}
              onPress={() => {
                void persist({ ...config, activePersonaId: persona.id });
              }}
            >
              <Text style={styles.cardTitle}>{persona.name}</Text>
              <Text style={styles.meta} numberOfLines={3}>
                {persona.instructions}
              </Text>
            </Pressable>
          ))}
        </Section>

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
  card: {
    borderWidth: 1,
    borderColor: colors.charcoal,
    padding: 12,
    gap: 6,
  },
  cardActive: { borderColor: colors.accent },
  cardTitle: {
    color: colors.accent,
    fontFamily: fonts.mono,
    fontWeight: '700',
    fontSize: 13,
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
