import { injectable } from 'tsyringe';
import { prisma } from '../../../config/database';
import {
  notificationChannelConfigSchema,
  DEFAULT_NOTIFICATION_CHANNEL_CONFIG,
  DEFAULT_NOTIFICATION_GLOBAL_CHANNELS,
} from '@transitsoftservices/shared';
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

// Par defaut : IN_APP + EMAIL + WHATSAPP sur toutes les notifications.
const DEFAULT_CHANNELS: NotificationChannel[] = ['IN_APP', 'EMAIL', 'WHATSAPP'];

/**
 * Service principal de notification. Point d'entree unique pour declencher
 * une notification multi-canal a partir d'un evenement metier.
 *
 * Comportement :
 *  - Canaux par defaut : IN_APP + EMAIL + WHATSAPP (configurable par tenant)
 *  - Chaque canal est best-effort : un echec d'email n'annule pas le WhatsApp
 *  - Les canaux desactives par le tenant sont SKIPPED avant dispatch
 *  - Les providers externes sont SKIPPED si non configures (pas d'erreur)
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
    const requested = payload.channels && payload.channels.length > 0
      ? payload.channels
      : DEFAULT_CHANNELS;

    // Filtrer les canaux desactives par le tenant (global + par event).
    const eventKind = payload.metadata?.kind as string | undefined;
    const channels = await this.filterByTenantConfig(target, requested, eventKind);

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

  /**
   * Retire de la liste les canaux que le tenant a desactives.
   * Logique :
   *  1. Si global channels.<canal> == false => retire definitivement.
   *  2. Si events.<kind>.<canal> == false => retire pour cet event.
   *  3. IN_APP n'est jamais retire (canal interne, pas de cout reseau).
   */
  private async filterByTenantConfig(
    target: NotificationTarget,
    channels: NotificationChannel[],
    eventKind?: string,
  ): Promise<NotificationChannel[]> {
    const orgId = target.organizationId ?? await this.resolveOrgId(target);
    if (!orgId) return channels;

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { notificationConfig: true },
    });

    const raw = org?.notificationConfig ?? null;
    const parsed = notificationChannelConfigSchema.safeParse(raw ?? DEFAULT_NOTIFICATION_CHANNEL_CONFIG);
    const cfg = parsed.success ? parsed.data : DEFAULT_NOTIFICATION_CHANNEL_CONFIG;

    const globalCh = cfg.channels ?? DEFAULT_NOTIFICATION_GLOBAL_CHANNELS;
    const eventCh = eventKind ? (cfg.events?.[eventKind] ?? {}) : {};

    return channels.filter(ch => {
      if (ch === 'IN_APP') return true;
      // Vérification master switch global
      if (ch === 'EMAIL' && globalCh.email === false) return false;
      if (ch === 'WHATSAPP' && globalCh.whatsapp === false) return false;
      if (ch === 'SMS' && globalCh.sms === false) return false;
      if (ch === 'PUSH' && globalCh.push === false) return false;
      // Vérification override par event
      if (ch === 'EMAIL' && eventCh.email === false) return false;
      if (ch === 'WHATSAPP' && eventCh.whatsapp === false) return false;
      if (ch === 'SMS' && eventCh.sms === false) return false;
      if (ch === 'PUSH' && eventCh.push === false) return false;
      return true;
    });
  }

  private async resolveOrgId(target: NotificationTarget): Promise<string | null> {
    if (target.clientId) {
      const c = await prisma.client.findUnique({ where: { id: target.clientId }, select: { organizationId: true } });
      if (c?.organizationId) return c.organizationId;
    }
    if (target.userId) {
      const u = await prisma.user.findUnique({ where: { id: target.userId }, select: { organizationId: true } });
      if (u?.organizationId) return u.organizationId;
    }
    if (target.agencyId) {
      const a = await prisma.agency.findUnique({ where: { id: target.agencyId }, select: { organizationId: true } });
      if (a?.organizationId) return a.organizationId;
    }
    return null;
  }
}

// Singleton pratique pour les handlers d'evenements (qui ne sont pas
// dans le container DI).
export const notificationService = new NotificationService();
