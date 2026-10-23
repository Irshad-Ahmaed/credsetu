import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { fetchReceipt, MAX_RECEIPT_BYTES, ReceiptError } from '../mobile/src/receiptTransport.ts';
import { createReceiptStore, type CachedReceipt } from '../mobile/src/receiptStore.ts';

const id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const jpeg = new Uint8Array([255, 216, 255, 224, 0, 0, 255, 217]);
const options = { id, baseUrl: 'http://localhost:4000/v1', token: 'test-session' };
const response = (bytes = jpeg, mime = 'image/jpeg') => new Response(bytes, { headers: { 'Content-Type': mime } });
const fakeFetch = (fn: (...args: any[]) => Promise<Response>) => fn as typeof fetch;

test('receipt downloads use authenticated binary requests, without putting the token in the URL', async () => {
  const image = await fetchReceipt({ ...options, fetcher: fakeFetch(async (url, init) => {
    assert.equal(url, `http://localhost:4000/v1/loans/${id}/receipt`);
    assert.equal(init.headers.Authorization, 'Bearer test-session');
    assert.equal(init.method, 'GET');
    return response();
  }) });
  assert.deepEqual(image.bytes, jpeg);
  assert.equal(image.mimeType, 'image/jpeg');
});

test('invalid links and missing sessions fail before making any request', async () => {
  const fetcher = fakeFetch(async () => { assert.fail('Unexpected request'); });
  await assert.rejects(fetchReceipt({ ...options, id: '../private', fetcher }), (error: any) => error.status === 404);
  await assert.rejects(fetchReceipt({ ...options, token: null, fetcher }), (error: any) => error.status === 401);
});

test('expired sessions and absent receipts have distinct actionable errors', async () => {
  await assert.rejects(fetchReceipt({ ...options, fetcher: fakeFetch(async () => new Response('{}', { status: 401 })) }),
    (error: any) => error.status === 401 && /Sign in again/.test(error.message));
  await assert.rejects(fetchReceipt({ ...options, fetcher: fakeFetch(async () => new Response('{}', { status: 404 })) }),
    (error: any) => error.status === 404 && /no available receipt/.test(error.message));
});

test('the receipt loader rejects HTML/JSON, empty bytes and MIME/header mismatches', async () => {
  for (const result of [new Response('<html/>'), response(new Uint8Array()), response(jpeg, 'image/png'),
    response(new Uint8Array([1, 2, 3]), 'image/jpeg')]) {
    await assert.rejects(fetchReceipt({ ...options, fetcher: fakeFetch(async () => result) }), ReceiptError);
  }
});

test('PNG and WebP receipts are accepted with matching content signatures', async () => {
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0]);
  const webp = new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80]);
  for (const [bytes, mime] of [[png, 'image/png'], [webp, 'image/webp']] as const) {
    assert.equal((await fetchReceipt({ ...options, fetcher: fakeFetch(async () => response(bytes, mime)) })).mimeType, mime);
  }
});

test('both declared and actual receipt sizes are bounded', async () => {
  const declared = response(); declared.headers.set('Content-Length', String(MAX_RECEIPT_BYTES + 1));
  let bodyRead = false;
  declared.arrayBuffer = async () => { bodyRead = true; return jpeg.buffer; };
  await assert.rejects(fetchReceipt({ ...options, fetcher: fakeFetch(async () => declared) }), /5 MB/);
  assert.equal(bodyRead, false);
  await assert.rejects(fetchReceipt({ ...options, fetcher: fakeFetch(async () => response(new Uint8Array(MAX_RECEIPT_BYTES + 1))) }), /damaged/);
});

test('stalled downloads time out and cancel the transport', async () => {
  let aborted = false;
  const fetcher = fakeFetch(async (_url, init) => new Promise<Response>((_resolve, reject) => {
    init.signal.addEventListener('abort', () => { aborted = true; reject(new Error('cancelled')); });
  }));
  await assert.rejects(fetchReceipt({ ...options, fetcher, timeoutMs: 5 }), /timed out/);
  assert.equal(aborted, true);
});

test('a closed viewer cancels a pending download and an already-cancelled request never starts', async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(fetchReceipt({ ...options, signal: controller.signal,
    fetcher: fakeFetch(async () => { assert.fail('Unexpected request'); }) }), /cancelled/);
  const active = new AbortController();
  const work = fetchReceipt({ ...options, signal: active.signal, fetcher: fakeFetch(async (_url, init) => new Promise<Response>((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new Error('cancelled')));
  })) });
  active.abort(); await assert.rejects(work, /cancelled/);
});

function setup(t: TestContext, decodeTimeoutMs?: number) {
  const calls: { id: string; signal: AbortSignal; resolve: (file: CachedReceipt) => void; reject: (error: unknown) => void }[] = [];
  const disposed: string[] = [];
  const file = (uri: string): CachedReceipt => ({ uri, dispose: () => { disposed.push(uri); } });
  const store = createReceiptStore((id, signal) => new Promise<CachedReceipt>((resolve, reject) => calls.push({ id, signal, resolve, reject })), decodeTimeoutMs);
  t.after(() => store.cancel());
  return { store, calls, disposed, file };
}

test('a successful download remains loading until the local image is decoded', async (t) => {
  const { store, calls, file } = setup(t);
  const work = store.load(id); calls[0].resolve(file('file:///one.jpg')); await work;
  assert.equal(store.getSnapshot().loading, true);
  assert.equal(store.getSnapshot().uri, 'file:///one.jpg');
  store.imageLoaded('file:///one.jpg');
  assert.equal(store.getSnapshot().loading, false);
});

test('retry releases the old file and stale image callbacks cannot erase the new receipt', async (t) => {
  const { store, calls, disposed, file } = setup(t);
  const first = store.load(id); calls[0].resolve(file('file:///one.jpg')); await first;
  store.imageLoaded('file:///one.jpg');
  const retry = store.load(id);
  assert.deepEqual(disposed, ['file:///one.jpg']);
  calls[1].resolve(file('file:///two.jpg')); await retry;
  store.imageFailed('file:///one.jpg');
  assert.equal(store.getSnapshot().uri, 'file:///two.jpg');
  store.imageLoaded('file:///two.jpg'); store.cancel();
  assert.deepEqual(disposed, ['file:///one.jpg', 'file:///two.jpg']);
});

test('out-of-order downloads are ignored and their files are removed', async (t) => {
  const { store, calls, disposed, file } = setup(t);
  const old = store.load(id); const current = store.load('new-receipt');
  assert.equal(calls[0].signal.aborted, true);
  calls[1].resolve(file('file:///current.jpg')); await current;
  calls[0].resolve(file('file:///old.jpg')); await old;
  assert.deepEqual(disposed, ['file:///old.jpg']);
  assert.equal(store.getSnapshot().uri, 'file:///current.jpg');
  store.imageLoaded('file:///current.jpg');
});

test('closing or changing accounts disposes a file even if its download finishes late', async (t) => {
  const { store, calls, disposed, file } = setup(t);
  const work = store.load(id); store.cancel();
  calls[0].resolve(file('file:///late.jpg')); await work;
  assert.equal(store.getSnapshot().uri, null);
  assert.deepEqual(disposed, ['file:///late.jpg']);
});

test('image decoder failure is recoverable and removes the temporary photo', async (t) => {
  const { store, calls, disposed, file } = setup(t);
  const work = store.load(id); calls[0].resolve(file('file:///bad.jpg')); await work;
  store.imageFailed('file:///bad.jpg');
  assert.equal(store.getSnapshot().loading, false);
  assert.match(store.getSnapshot().error, /could not be displayed/);
  assert.equal(store.getSnapshot().uri, null);
  assert.deepEqual(disposed, ['file:///bad.jpg']);
});

test('session failures are exposed to the sign-in action and can be retried', async (t) => {
  const { store, calls } = setup(t);
  const work = store.load(id); calls[0].reject(new ReceiptError('Sign in again', 401)); await work;
  assert.equal(store.getSnapshot().status, 401);
  assert.equal(store.getSnapshot().loading, false);
  const retry = store.load(id); calls[1].reject(new Error('Offline')); await retry;
  assert.equal(store.getSnapshot().status, 0);
  assert.equal(store.getSnapshot().error, 'Offline');
});

test('a missing image decode callback cannot leave an endless spinner', async (t) => {
  const { store, calls, file } = setup(t, 5);
  const work = store.load(id); calls[0].resolve(file('file:///stalled.jpg')); await work;
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(store.getSnapshot().loading, false);
  assert.match(store.getSnapshot().error, /could not be displayed/);
});
