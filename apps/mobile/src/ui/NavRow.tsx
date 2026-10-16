import { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from './theme';

export function NavRow({
  label,
  subtitle,
  onPress,
  trailing,
}: {
  label: string;
  subtitle?: string;
  onPress: () => void;
  trailing?: ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="button"
    >
      <View style={styles.copy}>
        <Text style={styles.label}>{label}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {trailing ?? <Text style={styles.chevron}>→</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    borderWidth: 1,
    borderColor: colors.charcoal,
    backgroundColor: colors.panel,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  pressed: { opacity: 0.7, borderColor: colors.accent },
  copy: { flex: 1, gap: 2 },
  label: {
    color: colors.accent,
    fontFamily: fonts.mono,
    fontSize: 14,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.muted,
    fontFamily: fonts.mono,
    fontSize: 11,
  },
  chevron: {
    color: colors.accent,
    fontFamily: fonts.mono,
    fontSize: 16,
  },
});
