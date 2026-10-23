export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
export type ReceiptImage = { bytes: Uint8Array; mimeType: 'image/jpeg' | 'image/png' | 'image/webp' };

export class ReceiptError extends Error {
  constructor(message: string, public status = 0) { super(message); }
}

function imageMime(bytes: Uint8Array): ReceiptImage['mimeType'] | null {
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)) return 'image/png';
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
    && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'image/webp';
  return null;
}

type Options = {
  baseUrl: string; id: string; token: string | null; signal?: AbortSignal;
  fetcher?: typeof fetch; timeoutMs?: number;
};

export async function fetchReceipt({ baseUrl, id, token, signal, fetcher = fetch, timeoutMs = 20_000 }: Options): Promise<ReceiptImage> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new ReceiptError('This receipt link is invalid. Close it and refresh your ledger.', 404);
  }
  if (!token) throw new ReceiptError('Your session has expired. Sign in again to view this receipt.', 401);
  const controller = new AbortController();
  const abort = () => controller.abort();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  if (signal?.aborted) controller.abort(); else signal?.addEventListener('abort', abort, { once: true });
  try {
    if (controller.signal.aborted) throw new ReceiptError('Receipt loading was cancelled.');
    const response = await fetcher(`${baseUrl.replace(/\/$/, '')}/loans/${encodeURIComponent(id)}/receipt`, {
      method: 'GET', headers: { Authorization: `Bearer ${token}`, Accept: 'image/jpeg, image/png, image/webp' }, signal: controller.signal,
    });
    if (!response.ok) {
      if (response.status === 401) throw new ReceiptError('Your session has expired. Sign in again to view this receipt.', 401);
      if (response.status === 404) throw new ReceiptError('This entry has no available receipt. Close this view and refresh your ledger.', 404);
      if (response.status === 403) throw new ReceiptError('You do not have access to this receipt.', 403);
      throw new ReceiptError('MiniLedger could not load the receipt. Please try again.', response.status);
    }
    const mimeType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
    if (mimeType !== 'image/jpeg' && mimeType !== 'image/png' && mimeType !== 'image/webp') {
      throw new ReceiptError('MiniLedger did not return a supported receipt photo. Refresh your ledger and try again.');
    }
    const declaredSize = Number(response.headers.get('content-length') ?? '0');
    if (declaredSize > MAX_RECEIPT_BYTES) throw new ReceiptError('This receipt exceeds the 5 MB size limit.');
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_RECEIPT_BYTES || imageMime(bytes) !== mimeType) {
      throw new ReceiptError('The downloaded receipt is empty, damaged, or has an unsupported format.');
    }
    if (controller.signal.aborted) throw new ReceiptError('Receipt loading was cancelled.');
    return { bytes, mimeType };
  } catch (cause) {
    controller.abort(); // Stop an unread error/oversized response body as well as failed downloads.
    if (timedOut) throw new ReceiptError('The receipt download timed out. Check your connection and retry.');
    if (signal?.aborted) throw new ReceiptError('Receipt loading was cancelled.');
    if (cause instanceof ReceiptError) throw cause;
    throw new ReceiptError('Could not download the receipt. Check that the MiniLedger API is running and your phone can reach it, then retry.');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}
