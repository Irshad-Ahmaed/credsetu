import { type LedgerSummary, type Loan, parseDashboard, parseLoan, parseLoanPage } from './ledgerTypes';

type Request = (path: string, options?: { signal?: AbortSignal; method?: string; body?: unknown }) => Promise<unknown>;
export type LedgerState = {
  rows: Loan[]; summary: LedgerSummary | null; loading: boolean; refreshing: boolean;
  loadingMore: boolean; error: string; pageError: string; page: number; hasMore: boolean; repayingId: string | null; deletingId: string | null;
};
const invalidResponse = 'MiniLedger returned an invalid ledger response. Update/restart the API, then try again.';
const message = (cause: unknown) => cause instanceof Error ? cause.message : 'Could not load your ledger.';
const unauthorized = (cause: unknown) => typeof cause === 'object' && cause !== null && 'status' in cause && cause.status === 401;

// Request ownership lives outside render closures so a late page or refresh cannot overwrite newer data.
export function createLedgerStore(request: Request, onUnauthorized: () => Promise<void>) {
  let state: LedgerState = {
    rows: [], summary: null, loading: true, refreshing: false, loadingMore: false,
    error: '', pageError: '', page: 1, hasMore: false, repayingId: null, deletingId: null,
  };
  const listeners = new Set<() => void>();
  let generation = 0;
  let lifecycle = 0;
  let refreshController: AbortController | null = null;
  let pageController: AbortController | null = null;
  let mutationController: AbortController | null = null;
  const update = (patch: Partial<LedgerState>) => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };
  const cancelReads = () => {
    generation += 1;
    refreshController?.abort(); pageController?.abort();
    refreshController = null; pageController = null;
  };
  const expireSession = async () => { await onUnauthorized().catch(() => undefined); };

  const refresh = async (_pull = false): Promise<boolean> => {
    cancelReads();
    const version = generation;
    const controller = new AbortController();
    refreshController = controller;
    update({ loading: !state.summary, refreshing: !!state.summary, loadingMore: false, error: '', pageError: '' });
    try {
      const response = await request('/dashboard', { signal: controller.signal });
      if (version !== generation) return false;
      const dashboard = parseDashboard(response);
      if (!dashboard) throw new Error(invalidResponse);
      update({ summary: dashboard.summary, rows: dashboard.entries.data, page: 1, hasMore: dashboard.entries.meta.has_more });
      return true;
    } catch (cause) {
      if (version !== generation) return false;
      update({ error: message(cause) });
      if (unauthorized(cause)) await expireSession();
      return false;
    } finally {
      if (version === generation) {
        refreshController = null;
        update({ loading: false, refreshing: false });
      }
    }
  };

  const loadMore = async (retry = false): Promise<void> => {
    if (refreshController || pageController || mutationController || !state.hasMore || !state.summary
      || (state.pageError && !retry)) return;
    const version = generation;
    const nextPage = state.page + 1;
    const controller = new AbortController();
    pageController = controller;
    update({ loadingMore: true, pageError: '' });
    try {
      const response = await request(`/loans?page=${nextPage}&limit=20`, { signal: controller.signal });
      if (version !== generation) return;
      const page = parseLoanPage(response);
      if (!page || page.meta.page !== nextPage || page.meta.limit !== 20) throw new Error(invalidResponse);
      const loadedIds = new Set(state.rows.map((loan) => loan.id));
      // Midnight or reordered entries invalidate offset pagination; reload the first page instead.
      if (page.meta.business_today !== state.summary?.business_today
        || page.meta.ledger_version !== state.summary?.ledger_version
        || page.data.some((loan) => loadedIds.has(loan.id))) {
        await refresh(true);
        return;
      }
      update({ rows: [...state.rows, ...page.data], page: nextPage, hasMore: page.meta.has_more });
    } catch (cause) {
      if (version !== generation) return;
      update({ pageError: message(cause) });
      if (unauthorized(cause)) await expireSession();
    } finally {
      if (version === generation) {
        pageController = null;
        update({ loadingMore: false });
      }
    }
  };

  const acceptRepayment = (loan: Loan) => {
    const previous = state.rows.find((row) => row.id === loan.id);
    let summary = state.summary;
    if (previous?.status === 'pending' && summary) {
      const amount = BigInt(previous.amount_paise);
      const overdue = previous.is_overdue ? amount : 0n;
      if (BigInt(summary.total_pending_paise) >= amount && BigInt(summary.total_overdue_paise) >= overdue) {
        summary = { ...summary,
          ledger_version: `${summary.ledger_version.split(':')[0]}:${BigInt(summary.ledger_version.split(':')[1]) + 1n}:${summary.ledger_version.split(':')[2]}`,
          total_pending_paise: String(BigInt(summary.total_pending_paise) - amount),
          total_repaid_paise: String(BigInt(summary.total_repaid_paise) + amount),
          total_overdue_paise: String(BigInt(summary.total_overdue_paise) - overdue),
        };
      }
    }
    update({ rows: state.rows.map((row) => row.id === loan.id ? loan : row), summary });
  };

  const repay = async (id: string) => {
    if (mutationController) return null;
    const previous = state.rows.find((row) => row.id === id);
    if (!previous || previous.status !== 'pending') return null;
    cancelReads();
    const version = lifecycle;
    const controller = new AbortController();
    mutationController = controller;
    update({ repayingId: id, loading: false, refreshing: false, loadingMore: false, error: '', pageError: '' });
    try {
      const response = await request(`/loans/${id}/repay`, { method: 'PATCH', body: {}, signal: controller.signal });
      if (version !== lifecycle) return null;
      const loan = parseLoan(response);
      if (!loan || loan.id !== id || loan.status !== 'repaid' || loan.amount_paise !== previous.amount_paise) {
        throw new Error('The repayment response was invalid. Refresh your ledger to check the saved status.');
      }
      acceptRepayment(loan);
      const refreshed = await refresh(true);
      if (version !== lifecycle) return null;
      const refreshPending = refreshController !== null;
      if (!refreshed && !refreshPending) update({ error: `Repayment saved. ${state.error || 'Pull to refresh for the latest ledger.'}` });
      return { saved: true, refreshed, refreshPending, message: '' };
    } catch (cause) {
      if (version !== lifecycle) return null;
      if (unauthorized(cause)) { await expireSession(); return null; }
      const refreshed = await refresh(true);
      if (version !== lifecycle) return null;
      return { saved: false, refreshed, message: message(cause) };
    } finally {
      if (version === lifecycle) { mutationController = null; update({ repayingId: null }); }
    }
  };

  const acceptDeletion = (id: string) => {
    const previous = state.rows.find((row) => row.id === id);
    let summary = state.summary;
    if (previous && summary) {
      const amount = BigInt(previous.amount_paise);
      const changes = {
        total_lent_paise: amount,
        total_pending_paise: previous.status === 'pending' ? amount : 0n,
        total_repaid_paise: previous.status === 'repaid' ? amount : 0n,
        total_overdue_paise: previous.is_overdue ? amount : 0n,
      };
      if (Object.entries(changes).every(([key, change]) => BigInt(summary![key as keyof typeof changes]) >= change)) {
        summary = { ...summary, ...Object.fromEntries(Object.entries(changes).map(([key, change]) =>
          [key, String(BigInt(summary![key as keyof typeof changes]) - change)])),
          ledger_version: `${summary.ledger_version.split(':')[0]}:${summary.ledger_version.split(':')[1]}:${BigInt(summary.ledger_version.split(':')[2]) + 1n}`,
        };
      }
    }
    // Deletion changes offsets. Only a fresh first page can safely resume pagination.
    update({ rows: state.rows.filter((row) => row.id !== id), summary, hasMore: false });
  };

  const deleteEntry = async (id: string) => {
    if (mutationController || !state.rows.some((row) => row.id === id)) return null;
    cancelReads();
    const version = lifecycle;
    const controller = new AbortController(); mutationController = controller;
    update({ deletingId: id, loading: false, refreshing: false, loadingMore: false, error: '', pageError: '' });
    try {
      const result = await request(`/loans/${id}`, { method: 'DELETE', signal: controller.signal });
      if (version !== lifecycle) return null;
      if (typeof result !== 'object' || result === null || !('id' in result) || result.id !== id
        || !('deleted' in result) || result.deleted !== true) throw new Error('Deletion could not be confirmed. Refresh your ledger before retrying.');
      acceptDeletion(id);
      const refreshed = await refresh(true);
      if (version !== lifecycle) return null;
      const refreshPending = refreshController !== null;
      if (!refreshed && !refreshPending) update({ error: `Entry deleted. ${state.error || 'Pull to refresh for the latest ledger.'}` });
      return { saved: true, refreshed, refreshPending, message: '' };
    } catch (cause) {
      if (version !== lifecycle) return null;
      if (unauthorized(cause)) { await expireSession(); return null; }
      const refreshed = await refresh(true);
      if (version !== lifecycle) return null;
      return { saved: false, refreshed, message: message(cause) };
    } finally {
      if (version === lifecycle) { mutationController = null; update({ deletingId: null }); }
    }
  };

  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    refresh, loadMore, repay, deleteEntry,
    suspend: () => {
      cancelReads();
      update({ loading: false, refreshing: false, loadingMore: false });
    },
    cancel: () => {
      lifecycle += 1; cancelReads(); mutationController?.abort(); mutationController = null;
      update({ repayingId: null, deletingId: null, refreshing: false, loadingMore: false });
    },
  };
}

