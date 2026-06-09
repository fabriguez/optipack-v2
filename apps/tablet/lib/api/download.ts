import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { apiClient } from './client';
import { toast } from '@/lib/toast';

/** Telecharge un fichier protege (PDF/XLSX) via l'API authentifiee et ouvre la feuille de partage. */
export async function downloadAndShare(path: string, fileName: string, ext: 'pdf' | 'xlsx' | 'csv'): Promise<void> {
  try {
    const res = await apiClient.get(path, { responseType: 'arraybuffer' });
    const bytes = new Uint8Array(res.data as ArrayBuffer);
    let bin = '';
    const chunk = 8192;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as unknown as number[]);
    }
    const g = globalThis as { btoa?: (s: string) => string };
    const base64 = g.btoa ? g.btoa(bin) : Buffer.from(bin, 'binary').toString('base64');
    const uri = `${FileSystem.cacheDirectory}${fileName}.${ext}`;
    await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri);
    else toast.error('Partage indisponible');
  } catch {
    toast.error('Telechargement impossible');
  }
}
