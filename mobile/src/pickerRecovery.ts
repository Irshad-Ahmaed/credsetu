import * as ImagePicker from 'expo-image-picker';
import { loadDraft, saveDraft } from './draft';
import { keepReceiptOnDevice, removeLocalReceipt } from './receiptFile';

// Android can destroy MainActivity while the system camera is open. Restore once
// during session hydration so this works even if Android returns to the ledger.
export async function recoverPendingReceipt(userId: string): Promise<void> {
  let result: Awaited<ReturnType<typeof ImagePicker.getPendingResultAsync>>;
  try { result = await ImagePicker.getPendingResultAsync(); } catch { return; }
  if (!result) return;
  const draft = await loadDraft(userId);
  if (!draft) return;
  if ('code' in result) {
    await saveDraft(userId, { ...draft, photoMessage: 'The photo picker closed unexpectedly. Try taking the photo again.' });
    return;
  }
  if (result.canceled || !result.assets[0]) return;
  try {
    const receiptUri = await keepReceiptOnDevice(result.assets[0].uri, { width: result.assets[0].width, height: result.assets[0].height });
    if (!await saveDraft(userId, { ...draft, receiptUri, photoMessage: undefined })) {
      removeLocalReceipt(receiptUri);
      return;
    }
    removeLocalReceipt(draft.receiptUri);
  } catch (error) {
    await saveDraft(userId, { ...draft, photoMessage: error instanceof Error ? error.message : 'Could not restore that photo. Your entry details are saved; try again.' });
  }
}
