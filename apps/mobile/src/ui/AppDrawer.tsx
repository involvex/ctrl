import { useRouter, type Href } from 'expo-router';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, fonts } from './theme';

export type DrawerLink = {
  label: string;
  subtitle?: string;
  href: Href;
};

const DEFAULT_LINKS: DrawerLink[] = [
  {
    label: 'Providers',
    subtitle: 'Order · cascade',
    href: '/providers' as Href,
  },
  {
    label: 'Agents',
    subtitle: 'Ask / Plan / Auto · personas',
    href: '/agents' as Href,
  },
  {
    label: 'Model setup',
    subtitle: 'LiteRT download · import',
    href: '/on-device',
  },
  { label: 'Connect', subtitle: 'Pair with PC', href: '/connect' as Href },
  {
    label: 'Host settings',
    subtitle: 'API keys · This PC / Cloud',
    href: '/settings',
  },
  { label: 'Knowledge', subtitle: 'Needs PC online', href: '/knowledge' },
  { label: 'Tools / MCP', subtitle: 'Needs PC online', href: '/tools' },
  { label: 'Channels', subtitle: 'Needs PC online', href: '/channels' },
];

export function AppDrawer({
  open,
  onClose,
  links = DEFAULT_LINKS,
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
                  pressed && styles.rowPressed,
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
    backgroundColor: colors.panel,
    borderRightWidth: 1,
    borderRightColor: colors.accent,
    paddingTop: 48,
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  brand: {
    color: colors.accent,
    fontFamily: fonts.mono,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 6,
  },
  tag: {
    color: colors.muted,
    fontFamily: fonts.mono,
    fontSize: 11,
    marginBottom: 16,
  },
  list: { gap: 8, paddingBottom: 24 },
  row: {
    borderWidth: 1,
    borderColor: colors.charcoal,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 4,
  },
  rowPressed: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(0, 255, 102, 0.08)',
  },
  rowLabel: {
    color: colors.accent,
    fontFamily: fonts.mono,
    fontWeight: '700',
    fontSize: 13,
  },
  rowSub: {
    color: colors.muted,
    fontFamily: fonts.mono,
    fontSize: 11,
  },
  closeBtn: { paddingVertical: 12, alignItems: 'center' },
  closeText: {
    color: colors.muted,
    fontFamily: fonts.mono,
    fontSize: 12,
  },
});
