import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { isManagedReceipt } from './draft';

function fileId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    return (char === 'x' ? random : (random & 0x3) | 0x8).toString(16);
  });
}

export async function keepReceiptOnDevice(uri: string, dimensions?: { width: number; height: number }): Promise<string> {
  if (!FileSystem.documentDirectory) throw new Error('Device storage is unavailable. Choose the photo again when storage is available.');
  const directory = FileSystem.documentDirectory + 'receipts/';
  const info = await FileSystem.getInfoAsync(directory);
  if (!info.exists) await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const width = dimensions?.width && dimensions.width > 0 ? dimensions.width : 1600;
  const height = dimensions?.height && dimensions.height > 0 ? dimensions.height : width;
  const longestSide = Math.max(width, height);
  const resizeAction = longestSide > 1600
    ? width >= height ? { resize: { width: 1600 } } : { resize: { height: 1600 } }
    : { resize: { width } };
  const compressed = await ImageManipulator.manipulateAsync(uri, [resizeAction], { compress: 0.68, format: ImageManipulator.SaveFormat.JPEG });
  let destination: string | null = null;
  try {
    const outputInfo = await FileSystem.getInfoAsync(compressed.uri);
    const size = outputInfo.exists && !outputInfo.isDirectory ? outputInfo.size ?? 0 : 0;
    if (!size || size > 5 * 1024 * 1024) throw new Error('This photo is still larger than 5 MB. Please choose a smaller photo.');
    destination = directory + fileId() + '.jpg';
    await FileSystem.copyAsync({ from: compressed.uri, to: destination });
    const savedInfo = await FileSystem.getInfoAsync(destination);
    if (!savedInfo.exists || savedInfo.isDirectory || !savedInfo.size || savedInfo.size > 5 * 1024 * 1024) {
      throw new Error('Could not save a usable receipt photo. Choose the photo again.');
    }
    return destination;
  } catch (error) {
    if (destination) await FileSystem.deleteAsync(destination, { idempotent: true }).catch(() => undefined);
    throw error;
  } finally {
    if (compressed.uri !== uri) await FileSystem.deleteAsync(compressed.uri, { idempotent: true }).catch(() => undefined);
  }
}

export function removeLocalReceipt(uri: string | null) {
  if (uri && isManagedReceipt(uri)) void FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
}
