import { Stack } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '../src/auth';
import { colors } from '../src/theme';

function RouteGuard() {
  const { ready, token } = useAuth();
  return <>
    <Stack screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Protected guard={!ready || !token}>
        <Stack.Screen name="login" />
        <Stack.Screen name="verify" />
      </Stack.Protected>
      <Stack.Protected guard={!ready || Boolean(token)}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
    </Stack>
    {!ready ? <View pointerEvents="auto" style={[StyleSheet.absoluteFill, styles.loading]}>
      <ActivityIndicator color={colors.primary} />
    </View> : null}
  </>;
}

const styles = StyleSheet.create({
  loading: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, zIndex: 1, elevation: 1 },
});

export default function RootLayout() {
  return <SafeAreaProvider><StatusBar style="dark" /><AuthProvider><RouteGuard /></AuthProvider></SafeAreaProvider>;
}
