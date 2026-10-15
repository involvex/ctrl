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
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
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
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.link}>← back</Text>
        </Pressable>
        <Text style={styles.title}>tools / MCP</Text>
        <Text style={styles.meta}>{status}</Text>
        <Pressable onPress={() => void refresh()}>
          <Text style={styles.link}>{busy ? 'refreshing…' : 'refresh'}</Text>
        </Pressable>

        <Text style={styles.label}>MCP servers</Text>
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

        <Pressable onPress={() => router.push('/knowledge' as Href)}>
          <Text style={styles.link}>knowledge / memory →</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/chat' as Href)}>
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
});
