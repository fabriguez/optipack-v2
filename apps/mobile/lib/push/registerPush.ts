import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { portalApi } from '@/lib/api/portal';
import { storage, STORAGE_KEYS } from '@/lib/storage/storage';

/**
 * Push notifications via Expo.
 *
 * IMPORTANT : inactif tant qu'aucun projectId EAS n'est configure
 * (Constants.expoConfig.extra.eas.projectId). Dans ce cas registerForPush()
 * est un no-op silencieux : SMS + WhatsApp continuent de fonctionner.
 * Une fois EAS pret, renseigner le projectId active le push sans autre change.
 */

// Affiche les notifications recues quand l'app est au premier plan.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function resolveProjectId(): string | undefined {
  const fromExtra = (Constants?.expoConfig as { extra?: { eas?: { projectId?: string } } } | null)
    ?.extra?.eas?.projectId;
  const fromEas = (Constants as { easConfig?: { projectId?: string } })?.easConfig?.projectId;
  return fromExtra ?? fromEas ?? undefined;
}

/**
 * Demande la permission, recupere l'ExpoPushToken et l'enregistre cote API.
 * Best-effort : ne jette jamais (le login ne doit pas echouer a cause du push).
 */
export async function registerForPush(): Promise<void> {
  try {
    if (!Device.isDevice) return; // simulateurs : pas de token push
    const projectId = resolveProjectId();
    if (!projectId) return; // EAS pas encore configure -> push inactif

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== 'granted') return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Notifications',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    if (!token) return;

    const saved = await storage.get<string>(STORAGE_KEYS.pushToken);
    await storage.set(STORAGE_KEYS.pushToken, token);
    // Re-enregistre si le token a change ou n'a jamais ete envoye.
    if (saved !== token) {
      await portalApi.registerPushToken(token);
    } else {
      // Meme token : on s'assure tout de meme qu'il est connu cote serveur.
      await portalApi.registerPushToken(token).catch(() => undefined);
    }
  } catch {
    // Silencieux : push best-effort.
  }
}

/** Desenregistre le token de l'appareil (appele au logout). */
export async function unregisterForPush(): Promise<void> {
  try {
    const token = await storage.get<string>(STORAGE_KEYS.pushToken);
    if (token) await portalApi.unregisterPushToken(token).catch(() => undefined);
    await storage.remove(STORAGE_KEYS.pushToken);
  } catch {
    // no-op
  }
}
