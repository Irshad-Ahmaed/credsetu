import { useCallback, useRef } from 'react';
import { AccessibilityInfo, Alert } from 'react-native';
import { formatPaise } from './format';
import type { Loan } from './ledgerTypes';

type Outcome = { saved: boolean; refreshed: boolean; refreshPending?: boolean; message: string } | null;
type Action = (id: string) => Promise<Outcome>;

export function useLedgerActions(repay: Action, deleteEntry: Action, busy: boolean) {
  const confirming = useRef(false);
  const confirm = useCallback((kind: 'repay' | 'delete', loan: Loan) => {
    if (confirming.current || busy) return;
    confirming.current = true;
    let submitted = false;
    const reset = () => { confirming.current = false; };
    const deleting = kind === 'delete';
    Alert.alert(deleting ? 'Delete this entry?' : 'Mark as repaid?', deleting
      ? `Delete ${loan.friend_name}'s ${formatPaise(loan.amount_paise)} entry? It will leave your ledger, its receipt will be removed, and your totals will update. This cannot be undone in the app.`
      : `${loan.friend_name} returned ${formatPaise(loan.amount_paise)}.`, [
      { text: 'Cancel', style: 'cancel', onPress: reset },
      { text: deleting ? 'Delete entry' : 'Mark repaid', style: deleting ? 'destructive' : 'default', onPress: async () => {
        submitted = true;
        try {
          const result = await (deleting ? deleteEntry : repay)(loan.id);
          if (!result) return;
          if (!result.saved) Alert.alert(deleting ? 'Check deletion status' : 'Check repayment status',
            `${result.message} ${result.refreshed ? 'Your ledger has been refreshed.' : 'Pull to refresh before retrying.'}`);
          else {
            AccessibilityInfo.announceForAccessibility(deleting ? 'Entry deleted. Totals updated.' : 'Entry marked as repaid.');
            if (!result.refreshed && !result.refreshPending) Alert.alert(deleting ? 'Entry deleted' : 'Repayment saved', 'The change was saved, but the latest ledger could not be loaded. Pull to refresh.');
          }
        } finally { reset(); }
      } },
    ], { cancelable: true, onDismiss: () => { if (!submitted) reset(); } });
  }, [busy, deleteEntry, repay]);
  return {
    markRepaid: useCallback((loan: Loan) => confirm('repay', loan), [confirm]),
    confirmDelete: useCallback((loan: Loan) => confirm('delete', loan), [confirm]),
  };
}
