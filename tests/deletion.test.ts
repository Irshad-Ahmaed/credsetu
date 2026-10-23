import test from 'node:test';
import assert from 'node:assert/strict';
import type { Express, RequestHandler } from 'express';
import type { Pool } from 'pg';
import { createLedgerStore } from '../mobile/src/ledgerStore.ts';
import { shouldDeleteSwipe, shouldStartSwipe } from '../mobile/src/swipeLogic.ts';
import { deleteOwnedLoan, registerDeleteLoan } from '../api/src/deleteLoan.ts';

const today = '2026-10-22';
const id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const loan = (repaid = false) => ({ id, friend_name: 'Test Friend', amount_paise: '100', due_on: '2026-10-21',
  status: repaid ? 'repaid' : 'pending', repaid_on: repaid ? today : null, is_overdue: !repaid, receipt_available: true });
const dashboard = (repaid = false, removed = false) => ({
  summary: { total_lent_paise: removed ? '0' : '100', total_repaid_paise: repaid && !removed ? '100' : '0',
    total_pending_paise: !repaid && !removed ? '100' : '0', total_overdue_paise: !repaid && !removed ? '100' : '0',
    business_today: today, business_time_zone: 'Asia/Kolkata', ledger_version: `1:${repaid ? 1 : 0}:${removed ? 1 : 0}` },
  entries: { data: removed ? [] : [loan(repaid)], meta: { page: 1, limit: 20, has_more: false,
    business_today: today, business_time_zone: 'Asia/Kolkata', ledger_version: `1:${repaid ? 1 : 0}:${removed ? 1 : 0}` } },
});

function setup() {
  const calls: { path: string; options?: { method?: string; signal?: AbortSignal }; resolve: (value: unknown) => void; reject: (error: unknown) => void }[] = [];
  let expired = 0;
  const store = createLedgerStore((path, options) => new Promise((resolve, reject) => calls.push({ path, options, resolve, reject })), async () => { expired += 1; });
  return { store, calls, expired: () => expired };
}

test('swipes activate in both horizontal directions without stealing ordinary vertical scrolls or taps', () => {
  assert.equal(shouldStartSwipe(30, 3, 1, false), true);
  assert.equal(shouldStartSwipe(-30, 3, 1, false), true);
  for (const [dx, dy] of [[3, 50], [-4, -70], [10, 1], [22, 20], [NaN, 0], [Infinity, 0]]) {
    assert.equal(shouldStartSwipe(dx, dy, 1, false), false);
  }
  assert.equal(shouldStartSwipe(90, 0, 2, false), false);
  assert.equal(shouldStartSwipe(90, 0, 1, true), false);
});

test('delete thresholds accept deliberate drags/flicks both ways and reject short, diagonal, or reverse flicks', () => {
  assert.equal(shouldDeleteSwipe(75, 5, 0, 280), true);
  assert.equal(shouldDeleteSwipe(-75, 5, 0, 280), true);
  assert.equal(shouldDeleteSwipe(45, 0, 1, 350), true);
  assert.equal(shouldDeleteSwipe(-45, 0, -1, 350), true);
  assert.equal(shouldDeleteSwipe(45, 0, -1, 350), false);
  assert.equal(shouldDeleteSwipe(35, 0, 2, 350), false);
  assert.equal(shouldDeleteSwipe(90, 100, 1, 350), false);
  assert.equal(shouldDeleteSwipe(90, 0, 1, 0), false);
});

test('deletion removes a confirmed pending/overdue entry and updates exact totals even if refresh fails', async () => {
  const { store, calls } = setup();
  const first = store.refresh(); calls[0].resolve(dashboard()); await first;
  const deletion = store.deleteEntry(id);
  assert.equal(calls[1].path, `/loans/${id}`);
  assert.equal(calls[1].options?.method, 'DELETE');
  assert.equal(store.getSnapshot().rows.length, 1); // Keep the card until the API acknowledges deletion.
  calls[1].resolve({ id, deleted: true }); await Promise.resolve();
  calls[2].reject(new Error('Offline')); const result = await deletion;
  assert.equal(result?.saved, true);
  assert.equal(store.getSnapshot().rows.length, 0);
  assert.equal(store.getSnapshot().summary?.total_lent_paise, '0');
  assert.equal(store.getSnapshot().summary?.total_pending_paise, '0');
  assert.equal(store.getSnapshot().summary?.total_overdue_paise, '0');
  assert.equal(store.getSnapshot().summary?.ledger_version, '1:0:1');
  assert.equal(store.getSnapshot().hasMore, false);
  assert.equal(store.getSnapshot().deletingId, null);
  assert.match(store.getSnapshot().error, /Entry deleted/);
});

test('deleting a repaid entry adjusts repaid totals and reaches a valid empty dashboard', async () => {
  const { store, calls } = setup();
  const first = store.refresh(); calls[0].resolve(dashboard(true)); await first;
  const deletion = store.deleteEntry(id); calls[1].resolve({ id, deleted: true }); await Promise.resolve();
  assert.equal(store.getSnapshot().summary?.total_repaid_paise, '0');
  assert.equal(store.getSnapshot().deletingId, id); // Keep all entry actions disabled while the empty dashboard is being refreshed.
  assert.equal(await store.repay(id), null);
  calls[2].resolve(dashboard(true, true)); await deletion;
  assert.equal(store.getSnapshot().rows.length, 0);
  assert.equal(store.getSnapshot().summary?.ledger_version, '1:1:1');
});

test('delete/repay mutations share a guard against duplicate and conflicting writes', async () => {
  const { store, calls } = setup();
  const first = store.refresh(); calls[0].resolve(dashboard()); await first;
  const deletion = store.deleteEntry(id);
  assert.equal(await store.deleteEntry(id), null);
  assert.equal(await store.repay(id), null);
  assert.equal(calls.length, 2);
  calls[1].resolve({ id, deleted: true }); await Promise.resolve();
  calls[2].resolve(dashboard(false, true)); await deletion;
});

test('failed or mismatched deletion responses retain the card until the ledger confirms its state', async () => {
  for (const malformed of [true, false]) {
    const { store, calls } = setup();
    const first = store.refresh(); calls[0].resolve(dashboard()); await first;
    const deletion = store.deleteEntry(id);
    if (malformed) calls[1].resolve({ id: 'another-id', deleted: true }); else calls[1].reject(new Error('Offline'));
    await Promise.resolve(); calls[2].resolve(dashboard());
    assert.equal((await deletion)?.saved, false);
    assert.equal(store.getSnapshot().rows.length, 1);
    assert.equal(store.getSnapshot().summary?.total_lent_paise, '100');
  }
});

test('account changes cancel deletion and late success cannot alter a different account', async () => {
  const { store, calls } = setup();
  const first = store.refresh(); calls[0].resolve(dashboard()); await first;
  const deletion = store.deleteEntry(id); store.cancel();
  assert.equal(calls[1].options?.signal?.aborted, true);
  calls[1].resolve({ id, deleted: true }); assert.equal(await deletion, null);
  assert.equal(store.getSnapshot().deletingId, null);
  assert.equal(calls.length, 2);
});

test('deletion expiry invokes sign-out and releases the busy state', async () => {
  const { store, calls, expired } = setup();
  const first = store.refresh(); calls[0].resolve(dashboard()); await first;
  const deletion = store.deleteEntry(id);
  calls[1].reject(Object.assign(new Error('Expired'), { status: 401 })); await deletion;
  assert.equal(expired(), 1);
  assert.equal(store.getSnapshot().deletingId, null);
});

test('a late pre-deletion refresh cannot restore the removed card', async () => {
  const { store, calls } = setup();
  const first = store.refresh(); calls[0].resolve(dashboard()); await first;
  const stale = store.refresh();
  const deletion = store.deleteEntry(id);
  assert.equal(calls[1].options?.signal?.aborted, true);
  calls[2].resolve({ id, deleted: true }); await Promise.resolve();
  calls[3].resolve(dashboard(false, true)); await deletion;
  calls[1].resolve(dashboard()); await stale;
  assert.equal(store.getSnapshot().rows.length, 0);
  assert.equal(store.getSnapshot().summary?.total_lent_paise, '0');
});

test('a delete plus replacement insert invalidates pagination even when the active count stays the same', async () => {
  const { store, calls } = setup();
  const many = dashboard();
  many.summary.total_lent_paise = '5000'; many.summary.total_pending_paise = '5000'; many.summary.total_overdue_paise = '5000';
  many.summary.ledger_version = '50:0:0'; many.entries.meta.ledger_version = '50:0:0'; many.entries.meta.has_more = true;
  many.entries.data = Array.from({length:20},(_,i)=>({...loan(),id:`first-${i}`}));
  const first = store.refresh(); calls[0].resolve(many); await first;
  const more = store.loadMore();
  calls[1].resolve({data:Array.from({length:20},(_,i)=>({...loan(),id:`next-${i}`})),
    meta:{...many.entries.meta,page:2,ledger_version:'51:0:1'}});
  await Promise.resolve();
  assert.equal(calls[2].path,'/dashboard');
  calls[2].resolve({...many,summary:{...many.summary,ledger_version:'51:0:1'},entries:{...many.entries,meta:{...many.entries.meta,ledger_version:'51:0:1'}}});
  await more;
  assert.equal(store.getSnapshot().page,1);
});

test('the delete route keeps authentication, rejects invalid IDs and does not reveal foreign entries', async () => {
  let handler: any;
  let queries = 0;
  const authenticate: RequestHandler = (_req, _res, next) => next();
  const app = { delete: (path: string, auth: unknown, action: unknown) => {
    assert.equal(path, '/v1/loans/:id'); assert.equal(auth, authenticate); handler = action;
  } } as unknown as Express;
  const db = { query: async () => { queries += 1; return { rowCount: 0, rows: [] }; } } as unknown as Pool;
  registerDeleteLoan(app, authenticate, db);
  let status = 200; let payload: any;
  const res = { status: (code: number) => { status = code; return res; }, json: (body: unknown) => { payload = body; } };
  await handler({ params: { id: 'invalid' }, userId: 'owner' }, res);
  assert.equal(status, 404); assert.equal(queries, 0);
  await handler({ params: { id }, userId: 'foreign' }, res);
  assert.equal(status, 404); assert.equal(payload.error.code, 'NOT_FOUND');
});

test('delete queries scope both the mutation and idempotent retry lookup to the owner', async () => {
  const values: unknown[][] = [];
  const db = { query: async (_sql: string, args: unknown[]) => {
    values.push(args); return { rowCount: values.length === 2 ? 1 : 0, rows: [] };
  } } as unknown as Pool;
  assert.equal(await deleteOwnedLoan(db, id, 'owner'), true);
  assert.deepEqual(values, [[id, 'owner'], [id, 'owner']]);
});
