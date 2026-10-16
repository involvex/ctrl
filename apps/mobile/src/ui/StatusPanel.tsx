import { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from './theme';

export function StatusPanel({
  children,
  lines,
}: {
  children?: ReactNode;
  lines?: string[];
}) {
  return (
    <View style={styles.panel}>
      {lines?.map((line) => (
        <Text key={line} style={styles.line}>
          {line}
        </Text>
      ))}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderWidth: 1,
    borderColor: colors.charcoal,
    backgroundColor: colors.panel,
    padding: 14,
    gap: 8,
  },
  line: {
    color: colors.accent,
    fontFamily: fonts.mono,
    fontSize: 12,
    opacity: 0.9,
  },
});
