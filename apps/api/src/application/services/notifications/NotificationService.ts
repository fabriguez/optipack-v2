import { injectable } from 'tsyringe';
import {
  deliverEmail,
  deliverInApp,
  deliverPush,
  deliverSms,
  deliverWhatsapp,
} from './channels';
import type {
  NotificationChannel,
  NotificationPayload,
  NotificationResult,
  NotificationTarget,
} from './types';

const DEFAULT_CHANNELS: NotificationChannel[] = ['IN_APP'];

/**
 * Service principal de notification. Point d'entree unique pour declencher
 * une notification multi-canal a partir d'un evenement metier.
 *
 * Comportement :
 *  - IN_APP est toujours inclus implicitement (sauf si exclu explicitement
 *    en passant un tableau qui ne le contient pas)
 *  - Chaque canal est best-effort : un echec d'email n'annule pas le SMS
 *  - Chaque canal cree son propre row Notification pour audit + statut
 *  - Les providers externes (SMS / WhatsApp / Push) sont SKIPPED si non
 *    configures -- pas d'erreur, pas de blocage
 *
 * Utilisation typique :
 *   await notificationService.notify(
 *     { clientId: 'xxx', agencyId: 'yyy' },
 *     {
 *       title: 'Colis arrive',
 *       message: 'Votre colis ABC123 est arrive a Yaounde.',
 *       channels: ['IN_APP', 'EMAIL', 'WHATSAPP'],
 *       metadata: { parcelId: 'xxx' },
 *     },
 *   );
 */
@injectable()
export class NotificationService {
  async notify(
    target: NotificationTarget,
    payload: NotificationPayload,
  ): Promise<NotificationResult> {
    const channels = payload.channels && payload.channels.length > 0
      ? payload.channels
      : DEFAULT_CHANNELS;

    // Lancement en parallele : pas de raison qu'IN_APP attende le SMS.
    // Chaque canal renvoie son propre ChannelDeliveryResult.
    const tasks: Promise<import('./types').ChannelDeliveryResult>[] = [];
    for (const channel of channels) {
      switch (channel) {
        case 'IN_APP':
          tasks.push(deliverInApp(target, payload));
          break;
        case 'EMAIL':
          tasks.push(deliverEmail(target, payload));
          break;
        case 'SMS':
          tasks.push(deliverSms(target, payload));
          break;
        case 'WHATSAPP':
          tasks.push(deliverWhatsapp(target, payload));
          break;
        case 'PUSH':
          tasks.push(deliverPush(target, payload));
          break;
      }
    }
    const results = await Promise.all(tasks);
    return { results };
  }
}

// Singleton pratique pour les handlers d'evenements (qui ne sont pas
// dans le container DI).
export const notificationService = new NotificationService();
