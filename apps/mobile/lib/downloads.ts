import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { storage, STORAGE_KEYS } from '@/lib/storage/storage';
import { toast } from '@/lib/toast';

const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
const API_URL = env?.EXPO_PUBLIC_API_URL ?? 'https://api.transitsoftservices.com/api/v1';

const SAF = FileSystem.StorageAccessFramework;

/**
 * Recupere le dossier public Android (SAF) ou deposer les telechargements.
 * Demande une seule fois a l'utilisateur de choisir un dossier (typiquement
 * "Download"), puis memorise l'autorisation pour les fois suivantes (depot
 * silencieux, sans re-demander). Retourne null si refus.
 */
async function getGrantedDir(): Promise<string | null> {
  const saved = await storage.get<string>(STORAGE_KEYS.downloadDirUri);
  if (saved) return saved;
  const perm = await SAF.requestDirectoryPermissionsAsync();
  if (!perm.granted) return null;
  await storage.set(STORAGE_KEYS.downloadDirUri, perm.directoryUri);
  return perm.directoryUri;
}

/**
 * Ecrit le fichier deja telecharge en cache dans le dossier public choisi
 * (Android, via SAF). Si l'autorisation memorisee est devenue invalide, on
 * la purge et on re-demande une fois. Retourne true si ecrit avec succes.
 */
async function saveToAndroidFolder(
  cacheUri: string,
  filename: string,
  mimeType: string,
): Promise<boolean> {
  // SAF gere l'extension via le mimeType : on passe le nom sans extension.
  const displayName = filename.replace(/\.[^./]+$/, '');
  const base64 = await FileSystem.readAsStringAsync(cacheUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const writeInto = async (dirUri: string): Promise<void> => {
    const fileUri = await SAF.createFileAsync(dirUri, displayName, mimeType);
    await FileSystem.writeAsStringAsync(fileUri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
  };

  let dir = await getGrantedDir();
  if (!dir) return false;
  try {
    await writeInto(dir);
    return true;
  } catch {
    // Autorisation persistee devenue invalide (dossier supprime, revoque...)
    // -> on purge et re-demande une fois.
    await storage.remove(STORAGE_KEYS.downloadDirUri);
    dir = await getGrantedDir();
    if (!dir) return false;
    try {
      await writeInto(dir);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Telecharge un fichier (PDF) authentifie puis l'enregistre directement dans
 * le dossier de telechargements de l'appareil.
 *
 * - Android : ecriture directe dans un dossier public choisi une fois (SAF,
 *   typiquement "Download"). Pas de menu de partage. Fallback partage si refus.
 * - iOS : pas de dossier "Downloads" global accessible (sandbox) -> on ouvre
 *   la feuille de partage native qui propose "Enregistrer dans Fichiers".
 *
 * Le nom `downloadAndShare` est conserve pour compat des appelants.
 */
export async function downloadAndShare(relativeUrl: string, filename: string): Promise<void> {
  const token = await storage.get<string>(STORAGE_KEYS.accessToken);
  const url =
    API_URL.replace(/\/$/, '') + (relativeUrl.startsWith('/') ? relativeUrl : '/' + relativeUrl);
  const target = `${FileSystem.cacheDirectory}${filename}`;
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  // Ecriture en streaming vers le cache (pas de base64 en RAM JS pour le DL).
  const result = await FileSystem.downloadAsync(url, target, { headers });
  if (result.status >= 400) {
    throw new Error(`HTTP ${result.status}`);
  }

  const mimeType = 'application/pdf';

  if (Platform.OS === 'android') {
    const saved = await saveToAndroidFolder(result.uri, filename, mimeType);
    if (saved) {
      toast.success('Enregistre dans vos telechargements');
      return;
    }
    // Refus du dossier -> on retombe sur le partage natif.
  }

  const available = await Sharing.isAvailableAsync();
  if (available) {
    await Sharing.shareAsync(result.uri, { mimeType, UTI: 'com.adobe.pdf' });
  } else {
    toast.error('Aucune application pour ouvrir le fichier');
  }
}
