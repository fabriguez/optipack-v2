import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { storage, STORAGE_KEYS } from '@/lib/storage/storage';

const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
const API_URL = env?.EXPO_PUBLIC_API_URL ?? 'https://api.transitsoftservices.com/api/v1';

/**
 * Telecharge un PDF avec authent JWT puis ouvre menu de partage natif.
 * Utilise expo-file-system pour ecrire en streaming (pas de base64
 * intermediaire en RAM JS, evite OOM sur gros PDFs).
 */
export async function downloadAndShare(relativeUrl: string, filename: string): Promise<void> {
  const token = await storage.get<string>(STORAGE_KEYS.accessToken);
  const url = API_URL.replace(/\/$/, '') + (relativeUrl.startsWith('/') ? relativeUrl : '/' + relativeUrl);
  const target = `${FileSystem.cacheDirectory}${filename}`;
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const result = await FileSystem.downloadAsync(url, target, { headers });
  if (result.status >= 400) {
    throw new Error(`HTTP ${result.status}`);
  }
  const available = await Sharing.isAvailableAsync();
  if (available) {
    await Sharing.shareAsync(result.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
  }
}
