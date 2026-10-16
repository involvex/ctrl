import { StyleSheet, Text, View } from 'react-native';
import { generatorLabel, type GeneratorMode } from '../device/inference-mode';
import { colors, fonts } from './theme';

export function ModeChip({ mode }: { mode: GeneratorMode }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.text}>generator · {generatorLabel(mode)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: 'rgba(0, 255, 102, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  text: {
    color: colors.accent,
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '700',
  },
});
