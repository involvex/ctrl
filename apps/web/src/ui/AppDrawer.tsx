import { useRouter, type Href } from 'expo-router';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

export type DrawerLink = {
  label: string;
  subtitle?: string;
  href: Href;
};

export const WEB_DRAWER_LINKS: DrawerLink[] = [
  { label: 'Chat', subtitle: 'Local-first transcript', href: '/chat' },
  {
    label: 'Conversations',
    subtitle: 'New · history · rename',
    href: '/conversations',
  },
  {
    label: 'Agents',
    subtitle: 'Ask / Plan / Auto · personas',
    href: '/agents',
  },
  { label: 'Providers', subtitle: 'API keys · model', href: '/settings' },
  { label: 'Knowledge', subtitle: 'Search · memory', href: '/knowledge' },
  { label: 'Tools / MCP', subtitle: 'Skills · servers', href: '/tools' },
  { label: 'Channels', subtitle: 'Webhook · chat apps', href: '/channels' },
  { label: 'Backups', subtitle: 'Host snapshots', href: '/backups' },
  { label: 'Connect', subtitle: 'Gateway URL · token', href: '/' },
];

export function AppDrawer({
  open,
  onClose,
  links = WEB_DRAWER_LINKS,
}: {
  open: boolean;
  onClose: () => void;
  links?: DrawerLink[];
}) {
  const router = useRouter();

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable style={styles.dismiss} onPress={onClose} />
        <View style={styles.panel}>
          <Text style={styles.brand}>ctrl</Text>
          <Text style={styles.tag}>menu</Text>
          <ScrollView contentContainerStyle={styles.list}>
            {links.map((link) => (
              <Pressable
                key={link.label}
                style={({ pressed }) => [
                  styles.row,
                  pressed ? styles.rowPressed : null,
                ]}
                onPress={() => {
                  onClose();
                  router.push(link.href);
                }}
              >
                <Text style={styles.rowLabel}>{link.label}</Text>
                {link.subtitle ? (
                  <Text style={styles.rowSub}>{link.subtitle}</Text>
                ) : null}
              </Pressable>
            ))}
          </ScrollView>
          <Pressable style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeText}>close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  dismiss: { flex: 1 },
  panel: {
    width: '78%',
    maxWidth: 320,
    backgroundColor: '#0a0f0c',
    borderRightWidth: 1,
    borderRightColor: '#00ff66',
    paddingTop: 48,
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  brand: {
    color: '#00ff66',
    fontFamily: 'monospace',
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 6,
  },
  tag: {
    color: '#6b7f72',
    fontFamily: 'monospace',
    fontSize: 11,
    marginBottom: 16,
  },
  list: { gap: 8, paddingBottom: 24 },
  row: {
    borderWidth: 1,
    borderColor: '#1f3328',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 4,
  },
  rowPressed: {
    borderColor: '#00ff66',
    backgroundColor: 'rgba(0, 255, 102, 0.08)',
  },
  rowLabel: {
    color: '#00ff66',
    fontFamily: 'monospace',
    fontWeight: '700',
    fontSize: 13,
  },
  rowSub: {
    color: '#6b7f72',
    fontFamily: 'monospace',
    fontSize: 11,
  },
  closeBtn: { paddingVertical: 12, alignItems: 'center' },
  closeText: {
    color: '#6b7f72',
    fontFamily: 'monospace',
    fontSize: 12,
  },
});
