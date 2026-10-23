import { ActivityIndicator, Text, View } from 'react-native';
import { Button } from './components';
import { colors } from './theme';

export function LedgerLoading() {
  return <View style={{ padding: 32, gap: 12 }}>
    <ActivityIndicator size="large" color={colors.primary} />
    <Text style={{ textAlign: 'center', color: colors.textSecondary }}>Loading your ledger…</Text>
  </View>;
}

export function LedgerFooter({ loading, error, onRetry }: { loading: boolean; error: string; onRetry: () => void }) {
  if (loading) return <ActivityIndicator accessibilityLabel="Loading more entries" color={colors.primary} style={{ padding: 20 }} />;
  if (!error) return null;
  return <View style={{ gap: 10, paddingVertical: 16 }}>
    <Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: 14, lineHeight: 20 }}>{error}</Text>
    <Button title="Retry loading entries" variant="secondary" onPress={onRetry} />
  </View>;
}
