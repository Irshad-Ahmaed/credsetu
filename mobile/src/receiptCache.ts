import { File, Paths } from 'expo-file-system';
import { API_URL, getToken } from './api';
import { type CachedReceipt } from './receiptStore';
import { fetchReceipt } from './receiptTransport';

export async function loadReceiptFile(id: string, signal: AbortSignal): Promise<CachedReceipt> {
  let token: string | null;
  try { token = await getToken(); }
  catch { throw new Error('Could not read your session from device storage. Close this view and try again.'); }
  const image = await fetchReceipt({ baseUrl: API_URL, id, token, signal });
  const extension = image.mimeType === 'image/jpeg' ? 'jpg' : image.mimeType === 'image/png' ? 'png' : 'webp';
  let file: File | null = null;
  const dispose = () => { try { if (file?.exists) file.delete(); } catch { /* Cache is also reclaimed by the OS. */ } };
  try {
    file = new File(Paths.cache, `miniledger-view-${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`);
    file.write(image.bytes);
    if (!file.exists || file.size !== image.bytes.length) throw new Error('Incomplete receipt file');
    return { uri: file.uri, dispose };
  } catch {
    dispose();
    throw new Error('Could not prepare the receipt on this device. Check available storage and try again.');
  }
}
