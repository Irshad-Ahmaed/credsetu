import test from 'node:test';
import assert from 'node:assert/strict';
import { createLedgerStore } from '../mobile/src/ledgerStore.ts';
import { parseDashboard, parseLoanPage } from '../mobile/src/ledgerTypes.ts';
import { loanJson } from '../api/src/ledgerQueries.ts';

const today = '2026-10-22';
const loan = (id: string) => ({ id, friend_name: 'Test Friend', amount_paise: '100', due_on: '2026-10-21',
  status: 'pending', repaid_on: null, is_overdue: true, receipt_available: false });
const page = (prefix = 'a', number = 1, more = true) => ({
  data: Array.from({ length: more ? 20 : 1 }, (_, i) => loan(`${prefix}-${i}`)),
  meta: { page: number, limit: 20, has_more: more, ledger_version: '50:0:0', business_today: today, business_time_zone: 'Asia/Kolkata' },
});
const dashboard = (prefix = 'a') => ({
  summary: { total_lent_paise: '5000', total_repaid_paise: '0', total_pending_paise: '5000', total_overdue_paise: '5000', business_today: today, ledger_version: '50:0:0', business_time_zone: 'Asia/Kolkata' },
  entries: page(prefix),
});

function setup() {
  const calls: { path: string; options?: { signal?: AbortSignal; method?: string; body?: unknown };
    resolve: (value: unknown) => void; reject: (reason: unknown) => void }[] = [];
  let expired = 0;
  const request = (path: string, options?: typeof calls[number]['options']) => new Promise<unknown>((resolve, reject) => {
    calls.push({ path, options, resolve, reject });
  });
  const store = createLedgerStore(request, async () => { expired += 1; });
  return { store, calls, expired: () => expired };
}

test('Home loads summary and first page with one dashboard request', async () => {
  const { store, calls } = setup();
  const work = store.refresh();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, '/dashboard');
  calls[0].resolve(dashboard()); await work;
  assert.equal(store.getSnapshot().rows.length, 20);
  assert.equal(store.getSnapshot().summary?.total_pending_paise, '5000');
  assert.equal(store.getSnapshot().loading, false);
});

test('a newer refresh wins even if an aborted request later resolves', async () => {
  const { store, calls } = setup();
  const old = store.refresh(); const latest = store.refresh();
  assert.equal(calls[0].options?.signal?.aborted, true);
  calls[1].resolve(dashboard('new')); await latest;
  calls[0].resolve(dashboard('old')); await old;
  assert.equal(store.getSnapshot().rows[0].id, 'new-0');
});

test('refresh aborts pagination and late pages cannot append to refreshed rows', async () => {
  const { store, calls } = setup();
  const first = store.refresh(); calls[0].resolve(dashboard()); await first;
  const more = store.loadMore();
  const fresh = store.refresh(true);
  assert.equal(calls[1].options?.signal?.aborted, true);
  await store.loadMore(); assert.equal(calls.length, 3);
  calls[2].resolve(dashboard('fresh')); await fresh;
  calls[1].resolve(page('old', 2)); await more;
  assert.equal(store.getSnapshot().rows.length, 20);
  assert.equal(store.getSnapshot().rows[0].id, 'fresh-0');
});

test('rapid pagination calls are serialized and advance pages without waiting for React renders', async () => {
  const { store, calls } = setup();
  const first = store.refresh(); calls[0].resolve(dashboard()); await first;
  const more = store.loadMore(); await store.loadMore();
  assert.equal(calls.length, 2);
  calls[1].resolve(page('b', 2)); await more;
  const last = store.loadMore();
  assert.equal(calls[2].path, '/loans?page=3&limit=20');
  calls[2].resolve(page('c', 3, false)); await last;
  assert.equal(store.getSnapshot().rows.length, 41);
  assert.equal(store.getSnapshot().hasMore, false);
});

test('failed pagination requires explicit retry and keeps already loaded entries', async () => {
  const { store, calls } = setup();
  const first = store.refresh(); calls[0].resolve(dashboard()); await first;
  const more = store.loadMore(); calls[1].reject(new Error('Offline')); await more;
  assert.equal(store.getSnapshot().rows.length, 20);
  assert.equal(store.getSnapshot().pageError, 'Offline');
  await store.loadMore(); assert.equal(calls.length, 2);
  const retry = store.loadMore(true);
  assert.equal(calls[2].path, '/loans?page=2&limit=20');
  calls[2].resolve(page('retry', 2, false)); await retry;
  assert.equal(store.getSnapshot().pageError, '');
});

test('invalid summaries never enter the screen and refresh failure retains the last valid snapshot', async () => {
  const { store, calls } = setup();
  const initial = store.refresh(); calls[0].resolve({ summary: null, entries: page() });
  assert.equal(await initial, false);
  assert.equal(store.getSnapshot().summary, null);
  assert.match(store.getSnapshot().error, /invalid ledger response/);
  const valid = store.refresh(); calls[1].resolve(dashboard()); await valid;
  const broken = store.refresh(true); calls[2].resolve({ ...dashboard(), summary: { ...dashboard().summary, total_lent_paise: '1' } });
  assert.equal(await broken, false);
  assert.equal(store.getSnapshot().rows.length, 20);
  assert.equal(store.getSnapshot().summary?.total_lent_paise, '5000');
});

test('confirmed repayment updates exact balances, blocks duplicate writes, and survives a refresh failure', async () => {
  const { store, calls } = setup();
  const initial = store.refresh(); calls[0].resolve(dashboard()); await initial;
  const save = store.repay('a-0');
  assert.equal(await store.repay('a-0'), null);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].options?.method, 'PATCH');
  calls[1].resolve({ ...loan('a-0'), status: 'repaid', repaid_on: today, is_overdue: false });
  await Promise.resolve();
  assert.equal(calls[2].path, '/dashboard');
  calls[2].reject(new Error('Offline')); const result = await save;
  assert.equal(result?.saved, true);
  assert.equal(result?.refreshed, false);
  assert.equal(store.getSnapshot().rows[0].status, 'repaid');
  assert.equal(store.getSnapshot().summary?.total_repaid_paise, '100');
  assert.equal(store.getSnapshot().summary?.total_pending_paise, '4900');
  assert.equal(store.getSnapshot().summary?.total_overdue_paise, '4900');
  assert.equal(store.getSnapshot().repayingId, null);
  assert.match(store.getSnapshot().error, /Repayment saved/);
  assert.equal(await store.repay('a-0'), null);
});

test('expiry signs out but cancelled old requests cannot sign out a newer lifecycle', async () => {
  const { store, calls, expired } = setup();
  const old = store.refresh(); store.cancel();
  const current = store.refresh();
  calls[0].reject(Object.assign(new Error('Expired'), { status: 401 })); await old;
  assert.equal(expired(), 0);
  calls[1].reject(Object.assign(new Error('Expired'), { status: 401 })); await current;
  assert.equal(expired(), 1);
  assert.equal(store.getSnapshot().loading, false);
});

test('pagination crossing India midnight reloads the complete dashboard', async () => {
  const { store, calls } = setup();
  const first = store.refresh(); calls[0].resolve(dashboard()); await first;
  const more = store.loadMore();
  calls[1].resolve({ ...page('b', 2, false), meta: { ...page().meta, page: 2, has_more: false, business_today: '2026-10-23' } });
  await Promise.resolve();
  assert.equal(calls[2].path, '/dashboard');
  calls[2].resolve(dashboard('new')); await more;
  assert.equal(store.getSnapshot().page, 1);
  assert.equal(store.getSnapshot().rows[0].id, 'new-0');
});

test('response guards reject missing pagination, invalid money, and overdue/status mismatches', () => {
  assert.equal(parseLoanPage({ data: [] }), null);
  assert.equal(parseDashboard({ ...dashboard(), summary: { ...dashboard().summary, total_lent_paise: 'NaN' } }), null);
  assert.equal(parseDashboard({ ...dashboard(), entries: { ...page(), data: [{ ...loan('a'), due_on: today, is_overdue: true }] } }), null);
  assert.equal(parseDashboard({ ...dashboard(), summary: { ...dashboard().summary, total_overdue_paise: '5001' } }), null);
  const all = dashboard();
  all.summary.total_lent_paise = '9007199254740993';
  all.summary.total_pending_paise = '9007199254740993';
  assert.ok(parseDashboard(all));
});

test('repayments on another device invalidate pagination even without overlapping rows', async () => {
  const { store, calls } = setup();
  const first = store.refresh(); calls[0].resolve(dashboard()); await first;
  const more = store.loadMore();
  calls[1].resolve({ ...page('b', 2), meta: { ...page('b', 2).meta, ledger_version: '50:1:0' } });
  await Promise.resolve();
  assert.equal(calls[2].path, '/dashboard');
  const changed = dashboard('changed');
  changed.summary.ledger_version = '50:1:0'; changed.entries.meta.ledger_version = '50:1:0';
  changed.summary.total_pending_paise = '4900'; changed.summary.total_repaid_paise = '100'; changed.summary.total_overdue_paise = '4900';
  calls[2].resolve(changed); await more;
  assert.equal(store.getSnapshot().page, 1);
  assert.equal(store.getSnapshot().summary?.total_repaid_paise, '100');
});

test('failed repayment does not fabricate a repaid status or change balances', async () => {
  const { store, calls } = setup();
  const first = store.refresh(); calls[0].resolve(dashboard()); await first;
  const save = store.repay('a-0');
  calls[1].reject(new Error('Connection lost'));
  await Promise.resolve();
  calls[2].resolve(dashboard()); const result = await save;
  assert.equal(result?.saved, false);
  assert.equal(result?.refreshed, true);
  assert.equal(store.getSnapshot().rows[0].status, 'pending');
  assert.equal(store.getSnapshot().summary?.total_repaid_paise, '0');
});

test('leaving the account aborts repayment work and ignores a late successful response', async () => {
  const { store, calls } = setup();
  const first = store.refresh(); calls[0].resolve(dashboard()); await first;
  const save = store.repay('a-0'); store.cancel();
  assert.equal(calls[1].options?.signal?.aborted, true);
  calls[1].resolve({ ...loan('a-0'), status: 'repaid', repaid_on: today, is_overdue: false });
  assert.equal(await save, null);
  assert.equal(calls.length, 2);
  assert.equal(store.getSnapshot().repayingId, null);
});

test('API loan serialization preserves calendar dates and uses the same overdue rule as Home', () => {
  const result = loanJson({ ...loan('test'), receipt_size: 10 }, today);
  assert.equal(result.is_overdue, true);
  assert.equal(result.receipt_available, true);
  assert.equal(result.due_on, '2026-10-21');
  assert.equal(loanJson({ ...loan('test'), due_on: today }, today).is_overdue, false);
  assert.equal(loanJson({ ...loan('test'), status: 'repaid' }, today).is_overdue, false);
});

