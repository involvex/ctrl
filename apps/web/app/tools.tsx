import { useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  listMcpServers,
  listTools,
  type McpServerInfo,
} from '@involvex/ctrl-i';
import type { ToolDefinition } from '@involvex/ctrl-s';
import { resolveConnectedWorkspace } from '../src/connection/workspace';

export default function ToolsScreen() {
  const router = useRouter();
  const [tools, setTools] = useState<ToolDefinition[]>([]);
  const [servers, setServers] = useState<McpServerInfo[]>([]);
  const [status, setStatus] = useState('loading…');
  const [busy, setBusy] = useState(true);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const connected = await resolveConnectedWorkspace();
      const [toolItems, mcpItems] = await Promise.all([
        listTools(connected.gatewayUrl),
        listMcpServers(connected.gatewayUrl),
      ]);
      setTools(toolItems);
      setServers(mcpItems);
      setStatus(
        `gateway · ${connected.gatewayUrl} · ${toolItems.length} tools · ${mcpItems.length} mcp`
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
        const [toolItems, mcpItems] = await Promise.all([
          listTools(connected.gatewayUrl),
          listMcpServers(connected.gatewayUrl),
        ]);
        if (cancelled) {
          return;
        }
        setTools(toolItems);
        setServers(mcpItems);
        setStatus(
          `gateway · ${connected.gatewayUrl} · ${toolItems.length} tools · ${mcpItems.length} mcp`
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
      <Text style={styles.title}>tools / MCP</Text>
      <Text style={styles.meta}>{status}</Text>
      <Pressable style={styles.button} onPress={() => void refresh()}>
        {busy ? (
          <ActivityIndicator color="#000" />
        ) : (
          <Text style={styles.buttonText}>refresh</Text>
        )}
      </Pressable>
      <Text style={styles.label}>MCP servers</Text>
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
      <Pressable onPress={() => router.push('/knowledge' as Href)}>
        <Text style={styles.link}>knowledge →</Text>
      </Pressable>
      <Pressable onPress={() => router.push('/settings' as Href)}>
        <Text style={styles.link}>providers →</Text>
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
  buttonText: { color: '#000', fontFamily: 'monospace', fontWeight: '700' },
  panel: {
    borderWidth: 1,
    borderColor: '#1f3328',
    padding: 12,
    backgroundColor: '#0a0f0c',
  },
});
