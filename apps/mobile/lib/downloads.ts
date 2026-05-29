import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { apiClient } from '@/lib/api/client';

/**
 * Telecharge un PDF via apiClient (Authorization automatique) puis ouvre
 * un menu de partage natif. Sauvegarde dans cacheDirectory.
 */
export async function downloadAndShare(url: string, filename: string): Promise<void> {
  // axios responseType arraybuffer puis convert base64
  const res = await apiClient.get(url, { responseType: 'arraybuffer' });
  const ab = res.data as ArrayBuffer;
  const b64 = arrayBufferToBase64(ab);
  const target = `${FileSystem.cacheDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(target, b64, { encoding: FileSystem.EncodingType.Base64 });
  const available = await Sharing.isAvailableAsync();
  if (available) {
    await Sharing.shareAsync(target, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  // @ts-expect-error global btoa available in RN
  return btoa(binary);
}
