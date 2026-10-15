import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useState } from 'react';

const DEFAULT_GATEWAY = 'http://127.0.0.1:7331';

export default function IndexScreen() {
  const [gatewayUrl, setGatewayUrl] = useState(DEFAULT_GATEWAY);

  return (
    <View style={styles.root}>
      <Text style={styles.brand}>ctrl</Text>
      <Text style={styles.tagline}>local agent platform · pwa</Text>
      <Text style={styles.label}>Gateway URL</Text>
      <TextInput
        style={styles.input}
        value={gatewayUrl}
        onChangeText={setGatewayUrl}
        autoCapitalize="none"
        autoCorrect={false}
        placeholderTextColor="#6b7f72"
        placeholder="http://127.0.0.1:7331"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 12,
  },
  brand: {
    color: '#00ff66',
    fontSize: 56,
    fontWeight: '700',
    letterSpacing: 10,
    fontFamily: 'monospace',
  },
  tagline: {
    color: '#6b7f72',
    fontFamily: 'monospace',
    marginBottom: 24,
  },
  label: {
    alignSelf: 'stretch',
    maxWidth: 420,
    color: '#00ff66',
    fontFamily: 'monospace',
    fontSize: 12,
    opacity: 0.8,
  },
  input: {
    alignSelf: 'stretch',
    maxWidth: 420,
    borderWidth: 1,
    borderColor: '#00ff66',
    color: '#00ff66',
    fontFamily: 'monospace',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#111613',
  },
});
