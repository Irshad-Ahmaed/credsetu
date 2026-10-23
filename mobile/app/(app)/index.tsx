import { useCallback } from 'react';
import { Alert, AppState, FlatList, RefreshControl } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/auth';
import { Button, ScreenMessage } from '../../src/components';
import { EmptyLedger, LedgerHeader } from '../../src/ledgerComponents';
import { LedgerFooter, LedgerLoading } from '../../src/ledgerFeedback';
import { colors } from '../../src/theme';
import { useLedger } from '../../src/useLedger';
import { LoanCard } from '../../src/LoanCard';
import { useLedgerActions } from '../../src/useLedgerActions';
import { useReducedMotion } from '../../src/useReducedMotion';

function millisecondsUntilIndiaMidnight() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value);
  const nextMidnightUtc = Date.UTC(part('year'), part('month') - 1, part('day') + 1) - 330 * 60_000;
  return Math.max(1000, nextMidnightUtc - Date.now() + 100);
}

export default function LedgerScreen() {
  const { signOut } = useAuth();
  const ledger = useLedger();
  const busy = !!ledger.repayingId || !!ledger.deletingId;
  const { markRepaid, confirmDelete } = useLedgerActions(ledger.repay, ledger.deleteEntry, busy);
  const reduceMotion = useReducedMotion();

  useFocusEffect(useCallback(() => {
    void ledger.refresh();
    let previousState = AppState.currentState;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        if (AppState.currentState === 'active') void ledger.refresh(true);
        schedule();
      }, millisecondsUntilIndiaMidnight());
    };
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && previousState !== 'active') {
        clearTimeout(timer); schedule(); void ledger.refresh(true);
      }
      previousState = state;
    });
    schedule();
    return () => { clearTimeout(timer); subscription.remove(); ledger.suspend(); };
  }, [ledger.refresh, ledger.suspend]));

  const confirmLogout = useCallback(() => Alert.alert('Log out?', 'Your local session and unsaved entry draft will be cleared.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Log out', style: 'destructive', onPress: () => {
      void signOut().catch(() => Alert.alert('Could not log out', 'Check device storage and try again.'));
    } },
  ]), [signOut]);

  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'left', 'right', 'bottom']}>
    <FlatList data={ledger.rows} keyExtractor={(item) => item.id}
      renderItem={({ item }) => <LoanCard loan={item} onRepay={markRepaid} onDelete={confirmDelete} repaying={ledger.repayingId === item.id}
        deleting={ledger.deletingId === item.id} busy={busy} reduceMotion={reduceMotion} businessToday={ledger.summary?.business_today ?? ''} />}
      ListHeaderComponent={<LedgerHeader summary={ledger.summary} error={ledger.error} busy={busy}
        onRetry={() => void ledger.refresh(true)} onAdd={() => router.push('/(app)/add')} onLogout={confirmLogout} />}
      ListEmptyComponent={ledger.loading ? <LedgerLoading />
        : ledger.error && !ledger.summary ? <ScreenMessage title="Couldn't load your ledger" body={ledger.error}
          action={<Button title="Try again" onPress={() => void ledger.refresh()} />} />
          : <EmptyLedger disabled={busy} onAdd={() => router.push('/(app)/add')} />}
      ListFooterComponent={<LedgerFooter loading={ledger.loadingMore} error={ledger.pageError} onRetry={() => void ledger.loadMore(true)} />}
      onEndReached={() => void ledger.loadMore()} onEndReachedThreshold={0.4}
      refreshControl={<RefreshControl enabled={!busy} refreshing={ledger.refreshing} onRefresh={() => { if (!busy) void ledger.refresh(true); }} tintColor={colors.primary} colors={[colors.primary]} />}
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24, flexGrow: 1 }} keyboardShouldPersistTaps="handled" />
  </SafeAreaView>;
}


