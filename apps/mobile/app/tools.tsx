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
  deleteMcpServer,
  listMcpServers,
  listSkills,
  listTools,
  reloadMcp,
  updateSkill,
  upsertMcpServer,
  type McpServerInfo,
  type SkillManifest,
} from '@involvex/ctrl-i';
import type { ToolDefinition } from '@involvex/ctrl-s';
import { resolveConnectedWorkspace } from '../src/connection/workspace';

export default function ToolsScreen() {
  const router = useRouter();
  const [tools, setTools] = useState<ToolDefinition[]>([]);
  const [servers, setServers] = useState<McpServerInfo[]>([]);
  const [skills, setSkills] = useState<SkillManifest[]>([]);
  const [gatewayUrl, setGatewayUrl] = useState('');
  const [status, setStatus] = useState('loading…');
  const [busy, setBusy] = useState(true);
  const [mcpIdDraft, setMcpIdDraft] = useState('');
  const [mcpNameDraft, setMcpNameDraft] = useState('');
  const [mcpCommandDraft, setMcpCommandDraft] = useState('');
  const [mcpArgsDraft, setMcpArgsDraft] = useState('');

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const connected = await resolveConnectedWorkspace();
      setGatewayUrl(connected.gatewayUrl);
      const [toolItems, mcpItems, skillItems] = await Promise.all([
        listTools(connected.gatewayUrl),
        listMcpServers(connected.gatewayUrl),
        listSkills(connected.gatewayUrl),
      ]);
      setTools(toolItems);
      setServers(mcpItems);
      setSkills(skillItems);
      setStatus(
        `gateway · ${connected.gatewayUrl} · ${toolItems.length} tools · ${mcpItems.length} mcp · ${skillItems.length} skills`
      );
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setBusy(true);
      try {
        const connected = await resolveConnectedWorkspace();
        if (cancelled) {
          return;
        }
        setGatewayUrl(connected.gatewayUrl);
        const [toolItems, mcpItems, skillItems] = await Promise.all([
          listTools(connected.gatewayUrl),
          listMcpServers(connected.gatewayUrl),
          listSkills(connected.gatewayUrl),
        ]);
        if (cancelled) {
          return;
        }
        setTools(toolItems);
        setServers(mcpItems);
        setSkills(skillItems);
        setStatus(
          `gateway · ${connected.gatewayUrl} · ${toolItems.length} tools · ${mcpItems.length} mcp · ${skillItems.length} skills`
        );
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
      <ScrollView contentContainerStyle={styles.scroll}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.link}>← back</Text>
        </Pressable>
        <Text style={styles.title}>tools / MCP / skills</Text>
        <Text style={styles.meta}>{status}</Text>
        <Pressable onPress={() => void refresh()}>
          <Text style={styles.link}>{busy ? 'refreshing…' : 'refresh'}</Text>
        </Pressable>

        <Text style={styles.label}>skills</Text>
        {skills.map((skill) => (
          <Pressable
            key={skill.id}
            style={styles.panel}
            onPress={() => {
              if (!gatewayUrl) {
                return;
              }
              void (async () => {
                try {
                  await updateSkill(gatewayUrl, skill.id, {
                    enabled: !skill.enabled,
                  });
                  await refresh();
                } catch (err) {
                  setStatus(err instanceof Error ? err.message : String(err));
                }
              })();
            }}
          >
            <Text style={styles.emphasis}>
              [{skill.enabled ? 'on' : 'off'}] {skill.name}
              {skill.builtin ? ' · builtin' : ''}
            </Text>
            <Text style={styles.meta}>
              {skill.id}
              {skill.description ? ` — ${skill.description}` : ''}
            </Text>
          </Pressable>
        ))}
        {skills.length === 0 && !busy ? (
          <Text style={styles.meta}>no skills</Text>
        ) : null}

        <Text style={styles.label}>MCP servers</Text>
        <Text style={styles.meta}>add / update server</Text>
        <TextInput
          style={styles.input}
          value={mcpIdDraft}
          onChangeText={setMcpIdDraft}
          placeholder="id"
          placeholderTextColor="#6b7f72"
          autoCapitalize="none"
          editable={!busy}
        />
        <TextInput
          style={styles.input}
          value={mcpNameDraft}
          onChangeText={setMcpNameDraft}
          placeholder="name"
          placeholderTextColor="#6b7f72"
          autoCapitalize="none"
          editable={!busy}
        />
        <TextInput
          style={styles.input}
          value={mcpCommandDraft}
          onChangeText={setMcpCommandDraft}
          placeholder="command (e.g. npx)"
          placeholderTextColor="#6b7f72"
          autoCapitalize="none"
          editable={!busy}
        />
        <TextInput
          style={styles.input}
          value={mcpArgsDraft}
          onChangeText={setMcpArgsDraft}
          placeholder="args (space-separated)"
          placeholderTextColor="#6b7f72"
          autoCapitalize="none"
          editable={!busy}
        />
        <Pressable
          style={[
            styles.button,
            (busy || !gatewayUrl) && styles.buttonDisabled,
          ]}
          disabled={busy || !gatewayUrl || mcpIdDraft.trim().length === 0}
          onPress={() => {
            if (!gatewayUrl) {
              return;
            }
            setBusy(true);
            void (async () => {
              try {
                const args = mcpArgsDraft.trim().split(/\s+/).filter(Boolean);
                await upsertMcpServer(gatewayUrl, {
                  id: mcpIdDraft.trim(),
                  name: mcpNameDraft.trim() || mcpIdDraft.trim(),
                  command: mcpCommandDraft.trim(),
                  args,
                });
                setMcpIdDraft('');
                setMcpNameDraft('');
                setMcpCommandDraft('');
                setMcpArgsDraft('');
                await refresh();
              } catch (err) {
                setStatus(err instanceof Error ? err.message : String(err));
                setBusy(false);
              }
            })();
          }}
        >
          <Text style={styles.buttonText}>save MCP server</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            if (!gatewayUrl || busy) {
              return;
            }
            void (async () => {
              setBusy(true);
              try {
                const result = await reloadMcp(gatewayUrl);
                setStatus(
                  `mcp reload · ${result.servers.length} servers · ${result.tools.length} tools`
                );
                await refresh();
              } catch (err) {
                setStatus(err instanceof Error ? err.message : String(err));
                setBusy(false);
              }
            })();
          }}
        >
          <Text style={styles.link}>{busy ? '…' : 'reload MCP servers'}</Text>
        </Pressable>
        {busy && servers.length === 0 ? (
          <ActivityIndicator color="#00ff66" />
        ) : null}
        {servers.map((server) => (
          <View key={server.id} style={styles.panel}>
            <Text style={styles.emphasis}>
              {server.name} · {server.id}
            </Text>
            <Text style={styles.meta}>
              {server.command
                ? `${server.command} ${(server.args ?? []).join(' ')}`
                : 'in-process / stub'}
            </Text>
            <Pressable
              disabled={busy || !gatewayUrl}
              onPress={() => {
                if (!gatewayUrl) {
                  return;
                }
                setBusy(true);
                void (async () => {
                  try {
                    await deleteMcpServer(gatewayUrl, server.id);
                    await refresh();
                  } catch (err) {
                    setStatus(err instanceof Error ? err.message : String(err));
                    setBusy(false);
                  }
                })();
              }}
            >
              <Text style={styles.link}>remove</Text>
            </Pressable>
          </View>
        ))}
        {servers.length === 0 && !busy ? (
          <Text style={styles.meta}>no MCP servers configured on gateway</Text>
        ) : null}

        <Text style={styles.label}>registered tools</Text>
        {tools.map((tool) => (
          <View key={tool.name} style={styles.panel}>
            <Text style={styles.emphasis}>
              {tool.name}
              {tool.requiresApproval ? ' · approval' : ''} · {tool.risk}
            </Text>
            <Text style={styles.meta}>{tool.description}</Text>
          </View>
        ))}
        {tools.length === 0 && !busy ? (
          <Text style={styles.meta}>no tools registered</Text>
        ) : null}

        <Pressable onPress={() => router.push('/knowledge')}>
          <Text style={styles.link}>knowledge / memory →</Text>
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
    marginTop: 10,
  },
  meta: {
    color: '#6b7f72',
    fontFamily: 'monospace',
    fontSize: 12,
    lineHeight: 18,
  },
  emphasis: {
    color: '#00ff66',
    fontFamily: 'monospace',
    fontWeight: '700',
    fontSize: 13,
  },
  panel: {
    borderWidth: 1,
    borderColor: '#1f3328',
    backgroundColor: '#0a0f0c',
    padding: 12,
    gap: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#00ff66',
    color: '#00ff66',
    fontFamily: 'monospace',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#111613',
  },
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
});
