import { Stack } from 'expo-router';
import { colors } from '../../src/theme';

export default function AppLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: 'slide_from_right' }}>
    <Stack.Screen name="index" />
    <Stack.Screen name="add" />
    <Stack.Screen name="receipt" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
  </Stack>;
}
