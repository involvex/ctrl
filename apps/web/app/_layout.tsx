import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

const screenOptions = {
  headerShown: false,
  contentStyle: { backgroundColor: '#000000' },
};

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={screenOptions} />
    </>
  );
}
