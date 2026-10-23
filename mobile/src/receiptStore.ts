import { ReceiptError } from './receiptTransport';

export type CachedReceipt = { uri: string; dispose: () => void };
type Loader = (id: string, signal: AbortSignal) => Promise<CachedReceipt>;
type State = { id: string; uri: string | null; loading: boolean; error: string; status: number };

export function createReceiptStore(loadFile: Loader, decodeTimeoutMs = 10_000) {
  let state: State = { id: '', uri: null, loading: true, error: '', status: 0 };
  let generation = 0;
  let controller: AbortController | null = null;
  let cached: CachedReceipt | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();
  const update = (patch: Partial<State>) => { state = { ...state, ...patch }; listeners.forEach((listener) => listener()); };
  const dispose = (file: CachedReceipt | null) => { try { file?.dispose(); } catch { /* OS cache cleanup remains available. */ } };
  const release = () => { clearTimeout(timer); dispose(cached); cached = null; };
  const imageFailed = (uri: string) => {
    if (state.uri !== uri) return;
    release();
    update({ uri: null, loading: false, error: 'The downloaded receipt could not be displayed. Try downloading it again.', status: 0 });
  };
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    load: async (id: string) => {
      const version = ++generation;
      controller?.abort(); release();
      const request = new AbortController(); controller = request;
      update({ id, uri: null, loading: true, error: '', status: 0 });
      try {
        const file = await loadFile(id, request.signal);
        if (version !== generation) { dispose(file); return; }
        cached = file;
        timer = setTimeout(() => imageFailed(file.uri), decodeTimeoutMs);
        update({ uri: file.uri });
      } catch (cause) {
        if (version !== generation) return;
        update({ loading: false, error: cause instanceof Error ? cause.message : 'Could not open this receipt. Please retry.',
          status: cause instanceof ReceiptError ? cause.status : 0 });
      } finally { if (version === generation) controller = null; }
    },
    imageLoaded: (uri: string) => {
      if (state.uri !== uri) return;
      clearTimeout(timer); update({ loading: false });
    },
    imageFailed,
    cancel: () => {
      generation += 1; controller?.abort(); controller = null; release();
      update({ uri: null, loading: false });
    },
  };
}
