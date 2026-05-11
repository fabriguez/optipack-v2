import { prisma } from '../../../config/database';
import type { NotificationChannel } from './types';

/**
 * Resout les preferences de notification d'un destinataire pour un kind
 * d'evenement donne. Retourne la liste des canaux autorises (intersection
 * entre canaux demandes par le code et canaux acceptes par le destinataire).
 *
 * Defaut quand aucune preference n'est posee : tous les canaux demandes
 * sont autorises (opt-out plutot que opt-in -- l'utilisateur recevra par
 * defaut, et peut couper depuis ses parametres).
 */
export async function filterChannelsByPrefs(
  target: { userId?: string | null; clientId?: string | null },
  kind: string | undefined,
  requested: NotificationChannel[],
): Promise<NotificationChannel[]> {
  if (!kind) return requested;

  let prefs: Record<string, { channels?: NotificationChannel[] }> | null = null;
  if (target.userId) {
    const u = await prisma.user.findUnique({
      where: { id: target.userId },
      select: { notificationPrefs: true },
    });
    prefs = (u?.notificationPrefs as never) ?? null;
  } else if (target.clientId) {
    const c = await prisma.client.findUnique({
      where: { id: target.clientId },
      select: { notificationPrefs: true },
    });
    prefs = (c?.notificationPrefs as never) ?? null;
  }

  if (!prefs || !prefs[kind]) return requested;
  const entry = prefs[kind] as { channels?: NotificationChannel[] } | undefined;
  const allowed = entry?.channels;
  if (!allowed || !Array.isArray(allowed)) return requested;
  return requested.filter((c) => allowed.includes(c));
}
