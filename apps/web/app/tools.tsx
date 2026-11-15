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
  const [mcpId, setMcpId] = useState('');
  const [mcpName, setMcpName] = useState('');
  const [mcpCommand, setMcpCommand] = useState('');
  const [mcpArgs, setMcpArgs] = useState('');

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
    <ScrollView contentContainerStyle={styles.root}>
      <Pressable onPress={() => router.back()}>
        <Text style={styles.link}>← back</Text>
      </Pressable>
      <Text style={styles.title}>tools / MCP / skills</Text>
      <Text style={styles.meta}>{status}</Text>
      <Pressable style={styles.button} onPress={() => void refresh()}>
        {busy ? (
          <ActivityIndicator color="#000" />
        ) : (
          <Text style={styles.buttonText}>refresh</Text>
        )}
      </Pressable>
      <Text style={styles.label}>skills</Text>
      {skills.length === 0 ? (
        <Text style={styles.meta}>no skills</Text>
      ) : (
        skills.map((skill) => (
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
            <Text style={styles.body}>
              [{skill.enabled ? 'on' : 'off'}] {skill.id} · {skill.name}
              {skill.builtin ? ' · builtin' : ''}
              {skill.description ? ` — ${skill.description}` : ''}
            </Text>
          </Pressable>
        ))
      )}
      <Text style={styles.label}>MCP servers</Text>
      <Text style={styles.meta}>Add or update stdio MCP server</Text>
      <TextInput
        style={styles.input}
        value={mcpId}
        onChangeText={setMcpId}
        placeholder="id"
        placeholderTextColor="#6b7f72"
        autoCapitalize="none"
      />
      <TextInput
        style={styles.input}
        value={mcpName}
        onChangeText={setMcpName}
        placeholder="name"
        placeholderTextColor="#6b7f72"
      />
      <TextInput
        style={styles.input}
        value={mcpCommand}
        onChangeText={setMcpCommand}
        placeholder="command (e.g. npx)"
        placeholderTextColor="#6b7f72"
        autoCapitalize="none"
      />
      <TextInput
        style={styles.input}
        value={mcpArgs}
        onChangeText={setMcpArgs}
        placeholder="args (space-separated)"
        placeholderTextColor="#6b7f72"
        autoCapitalize="none"
      />
      <Pressable
        style={[styles.button, (!gatewayUrl || busy) && styles.buttonDisabled]}
        disabled={!gatewayUrl || busy || !mcpId.trim() || !mcpCommand.trim()}
        onPress={() => {
          if (!gatewayUrl) {
            return;
          }
          void (async () => {
            setBusy(true);
            try {
              const args = mcpArgs.trim().split(/\s+/).filter(Boolean);
              await upsertMcpServer(gatewayUrl, {
                id: mcpId.trim(),
                name: mcpName.trim() || mcpId.trim(),
                command: mcpCommand.trim(),
                args,
              });
              await refresh();
            } catch (err) {
              setStatus(err instanceof Error ? err.message : String(err));
            } finally {
              setBusy(false);
            }
          })();
        }}
      >
        <Text style={styles.buttonText}>save MCP server</Text>
      </Pressable>
      <Pressable
        style={styles.button}
        disabled={busy || !gatewayUrl}
        onPress={() => {
          if (!gatewayUrl) {
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
        <Text style={styles.buttonText}>reload MCP</Text>
      </Pressable>
      {servers.length === 0 ? (
        <Text style={styles.meta}>no MCP servers</Text>
      ) : (
        servers.map((server) => (
          <View key={server.id} style={styles.panel}>
            <Text style={styles.body}>
              {server.id} · {server.name}
              {server.command
                ? ` · ${server.command} ${(server.args ?? []).join(' ')}`
                : ' · stub'}
            </Text>
            <Pressable
              style={styles.ghostBtn}
              disabled={!gatewayUrl || busy}
              onPress={() => {
                if (!gatewayUrl) {
                  return;
                }
                void (async () => {
                  try {
                    await deleteMcpServer(gatewayUrl, server.id);
                    await refresh();
                  } catch (err) {
                    setStatus(err instanceof Error ? err.message : String(err));
                  }
                })();
              }}
            >
              <Text style={styles.ghostText}>remove</Text>
            </Pressable>
          </View>
        ))
      )}
      <Text style={styles.label}>registered tools</Text>
      {tools.map((tool) => (
        <View key={tool.name} style={styles.panel}>
          <Text style={styles.body}>
            {tool.name} [{tool.risk}]
            {tool.requiresApproval ? ' · approval' : ''} — {tool.description}
          </Text>
        </View>
      ))}
      <Pressable onPress={() => router.push('/knowledge')}>
        <Text style={styles.link}>knowledge →</Text>
      </Pressable>
      <Pressable onPress={() => router.push('/settings')}>
        <Text style={styles.link}>providers →</Text>
      </Pressable>
      <Pressable onPress={() => router.push('/backups')}>
        <Text style={styles.link}>backups →</Text>
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
  button: {
    backgroundColor: '#00ff66',
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { color: '#000', fontFamily: 'monospace', fontWeight: '700' },
  input: {
    borderWidth: 1,
    borderColor: '#00ff66',
    color: '#00ff66',
    fontFamily: 'monospace',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#111613',
  },
  panel: {
    borderWidth: 1,
    borderColor: '#1f3328',
    padding: 12,
    backgroundColor: '#0a0f0c',
    gap: 8,
  },
  ghostBtn: {
    borderWidth: 1,
    borderColor: '#1f3328',
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  ghostText: { color: '#00ff66', fontFamily: 'monospace', fontSize: 11 },
});
