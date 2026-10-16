import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { colors, fonts } from './theme';

export function Field({
  label,
  hint,
  ...inputProps
}: {
  label: string;
  hint?: string;
} & TextInputProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      <TextInput
        {...inputProps}
        style={[styles.input, inputProps.style]}
        placeholderTextColor={colors.muted}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: {
    color: colors.accent,
    fontFamily: fonts.mono,
    fontSize: 12,
  },
  hint: {
    color: colors.muted,
    fontFamily: fonts.mono,
    fontSize: 11,
    lineHeight: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.accent,
    color: colors.accent,
    fontFamily: fonts.mono,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: colors.field,
  },
});
