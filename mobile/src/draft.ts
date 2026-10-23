import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system/legacy';

export type LoanDraft = { friendName: string; amount: string; dueOn: string; receiptUri: string | null; submissionKey: string; photoMessage?: string };
const draftKey = (userId: string) => `miniledger.loanDraft.${userId}`;
const pendingWrites = new Map<string, Promise<void>>();

export function isManagedReceipt(uri: string): boolean {
  const directory = FileSystem.documentDirectory ? `${FileSystem.documentDirectory}receipts/` : '';
  return !!directory && uri.startsWith(directory)
    && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$/i.test(uri.slice(directory.length));
}

function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1) return false;
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function parseDraft(value: unknown): LoanDraft | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.friendName !== 'string' || candidate.friendName.length > 80
    || typeof candidate.amount !== 'string' || candidate.amount.length > 16
    || typeof candidate.dueOn !== 'string' || (candidate.dueOn !== '' && !isCalendarDate(candidate.dueOn))
    || (candidate.receiptUri !== null && typeof candidate.receiptUri !== 'string')
    || typeof candidate.submissionKey !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate.submissionKey)
    || (candidate.photoMessage !== undefined && (typeof candidate.photoMessage !== 'string' || candidate.photoMessage.length > 300))) return null;
  if (typeof candidate.receiptUri === 'string' && !isManagedReceipt(candidate.receiptUri)) return null;
  return candidate as LoanDraft;
}

async function enqueue(userId: string, operation: () => Promise<void>): Promise<boolean> {
  const key = draftKey(userId);
  const previous = pendingWrites.get(key) ?? Promise.resolve();
  const task = previous.catch(() => undefined).then(operation);
  pendingWrites.set(key, task);
  try { await task; return true; }
  catch { return false; }
  finally { if (pendingWrites.get(key) === task) pendingWrites.delete(key); }
}

export async function loadDraft(userId: string): Promise<LoanDraft | null> {
  const key = draftKey(userId);
  await pendingWrites.get(key)?.catch(() => undefined);
  try {
    const raw = await SecureStore.getItemAsync(key);
    if (!raw) return null;
    const draft = parseDraft(JSON.parse(raw) as unknown);
    if (draft) return draft;
    await SecureStore.deleteItemAsync(key).catch(() => undefined);
    return null;
  } catch { return null; }
}

export function saveDraft(userId: string, draft: LoanDraft): Promise<boolean> {
  if (!parseDraft(draft)) return Promise.resolve(false);
  return enqueue(userId, async () => { await SecureStore.setItemAsync(draftKey(userId), JSON.stringify(draft)); });
}

export async function clearDraft(userId: string): Promise<boolean> {
  const captured: { draft: LoanDraft | null } = { draft: null };
  const cleared = await enqueue(userId, async () => {
    const key = draftKey(userId);
    try {
      const raw = await SecureStore.getItemAsync(key);
      if (raw) captured.draft = parseDraft(JSON.parse(raw) as unknown);
    } catch { /* The key deletion below still clears corrupt or unreadable data. */ }
    await SecureStore.deleteItemAsync(key);
  });
  if (!cleared) return false;
  if (captured.draft?.receiptUri) await FileSystem.deleteAsync(captured.draft.receiptUri, { idempotent: true }).catch(() => undefined);
  return true;
}
