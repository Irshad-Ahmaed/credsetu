import * as SecureStore from 'expo-secure-store';
import { File as ExpoFile, UploadType } from 'expo-file-system';

const baseUrl = (process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:4000/v1').replace(/\/$/, '');
export const API_URL = baseUrl;
const TOKEN_KEY = 'miniledger.session.v1';
const USER_KEY = 'miniledger.user.v1';
export const getToken = () => SecureStore.getItemAsync(TOKEN_KEY);
export const saveToken = (token: string) => SecureStore.setItemAsync(TOKEN_KEY, token);
export const clearToken = () => SecureStore.deleteItemAsync(TOKEN_KEY);
export const getUserSnapshot = async () => {
  try {
    const value = await SecureStore.getItemAsync(USER_KEY);
    if (!value) return null;
    const user: unknown = JSON.parse(value);
    if (typeof user === 'object' && user !== null && 'id' in user && 'phone_e164' in user
      && typeof user.id === 'string' && typeof user.phone_e164 === 'string') {
      return { id: user.id, phone_e164: user.phone_e164 };
    }
    await SecureStore.deleteItemAsync(USER_KEY).catch(() => undefined);
    return null;
  } catch {
    await SecureStore.deleteItemAsync(USER_KEY).catch(() => undefined);
    return null;
  }
};
export const saveUserSnapshot = (user: { id: string; phone_e164: string }) => SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
export const clearUserSnapshot = () => SecureStore.deleteItemAsync(USER_KEY);

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public fields?: Record<string, string>) { super(message); }
}

type Options = { method?: string; body?: unknown; key?: string; receiptUri?: string | null; signal?: AbortSignal };

function multipartParameters(body: unknown): Record<string, string> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid receipt upload fields.');
  const entries = Object.entries(body);
  if (entries.some(([, value]) => typeof value !== 'string')) throw new Error('Invalid receipt upload fields.');
  return Object.fromEntries(entries) as Record<string, string>;
}

function isUploadMethod(method: string): method is 'POST' | 'PUT' | 'PATCH' {
  return method === 'POST' || method === 'PUT' || method === 'PATCH';
}

function resolveUploadMethod(method?: string): 'POST' | 'PUT' | 'PATCH' {
  const value = method ?? 'POST';
  if (!isUploadMethod(value)) throw new Error('Receipt uploads require POST, PUT, or PATCH.');
  return value;
}

function parseResponseBody(body: string): unknown {
  try { return body ? JSON.parse(body) : null; }
  catch { return null; }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function createApiError(status: number, payload: unknown): ApiError {
  const error = isRecord(payload) && isRecord(payload.error) ? payload.error : {};
  const fields = isRecord(error.field_errors)
    ? Object.fromEntries(Object.entries(error.field_errors).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
    : undefined;
  return new ApiError(
    status,
    typeof error.code === 'string' ? error.code : 'REQUEST_FAILED',
    typeof error.message === 'string' ? error.message : 'Unable to complete the request.',
    fields,
  );
}

export async function api<T>(path: string, options: Options = {}): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.key) headers['Idempotency-Key'] = options.key;
  let body: BodyInit | undefined;
  if (!options.receiptUri && options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }
  const method = options.method ?? (options.receiptUri ? 'POST' : 'GET');
  const uploadMethod = options.receiptUri ? resolveUploadMethod(options.method) : undefined;
  const parameters = options.receiptUri ? multipartParameters(options.body) : undefined;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 20_000);
  const abortFromCaller = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  else options.signal?.addEventListener('abort', abortFromCaller, { once: true });
  try {
    let status: number;
    let payload: unknown;
    if (options.receiptUri) {
      // Expo's fetch FormData encoder rejects React Native's { uri, name, type } part.
      // FileSystem's native multipart upload supports local file URIs and extra form fields.
      const result = await new ExpoFile(options.receiptUri).upload(`${baseUrl}${path}`, {
        httpMethod: uploadMethod ?? 'POST',
        uploadType: UploadType.MULTIPART,
        fieldName: 'receipt',
        mimeType: 'image/jpeg',
        headers,
        parameters,
        signal: controller.signal,
      });
      status = result.status;
      payload = parseResponseBody(result.body);
    } else {
      const response = await fetch(`${baseUrl}${path}`, { method, headers, body, signal: controller.signal });
      status = response.status;
      payload = status === 204 ? null : await response.json().catch(() => null);
    }
    if (status < 200 || status >= 300) {
      throw createApiError(status, payload);
    }
    if (status !== 204 && (!isRecord(payload) || !('data' in payload) || payload.data == null)) {
      throw new ApiError(502, 'INVALID_RESPONSE', 'MiniLedger returned an invalid response. Your save could not be confirmed. Refresh your ledger or retry the same save.');
    }
    // Collection responses keep pagination metadata beside `data`.
    // Preserve that envelope when present; unwrap ordinary API responses.
    const hasMeta = isRecord(payload) && 'meta' in payload;
    const data = isRecord(payload) ? payload.data : undefined;
    return (hasMeta ? payload : data ?? payload) as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (options.receiptUri && __DEV__) {
      const reason = error instanceof Error ? `${error.name}: ${error.message}` : 'unknown transport error';
      console.warn(`[API] Receipt upload failed before a response (${reason})`);
    }
    if (error instanceof Error && error.name === 'AbortError') {
      if (timedOut) throw new Error('The request took too long. Check your connection, then retry.');
      throw new Error('The request was cancelled.');
    }
    throw new Error('Could not reach MiniLedger. Check your connection and API address, then retry.');
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abortFromCaller);
  }
}
