import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { api } from './api';
import { useAuth } from './auth';
import { createLedgerStore } from './ledgerStore';

export function useLedger() {
  const { user, signOut } = useAuth();
  const signOutRef = useRef(signOut);
  useEffect(() => { signOutRef.current = signOut; }, [signOut]);
  const store = useMemo(() => createLedgerStore(api, () => signOutRef.current({ preserveDraft: true })), [user?.id]);
  useEffect(() => () => store.cancel(), [store]);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return { ...state, refresh: store.refresh, loadMore: store.loadMore, repay: store.repay, deleteEntry: store.deleteEntry, suspend: store.suspend };
}
