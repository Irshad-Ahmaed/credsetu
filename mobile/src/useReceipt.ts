import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { useAuth } from './auth';
import { loadReceiptFile } from './receiptCache';
import { createReceiptStore } from './receiptStore';

export function useReceipt(id: string) {
  const { user } = useAuth();
  const store = useMemo(() => createReceiptStore(loadReceiptFile), [user?.id]);
  useEffect(() => {
    void store.load(id);
    return () => store.cancel();
  }, [id, store]);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const retry = useCallback(() => { void store.load(id); }, [id, store]);
  // Never display the previous receipt for a frame while the next route's effect starts.
  const state = snapshot.id === id ? snapshot : { ...snapshot, uri: null, loading: true, error: '', status: 0 };
  return { ...state, retry, imageLoaded: store.imageLoaded, imageFailed: store.imageFailed };
}
