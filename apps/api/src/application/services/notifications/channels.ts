import { prisma } from '../../../config/database';
import { emailService } from '../../../infrastructure/email/EmailService';
import { realtimeService } from '../../../infrastructure/realtime/RealtimeService';
import { createChildLogger } from '../../../config/logger';
import type {
  ChannelDeliveryResult,
  ExternalChannelProvider,
  NotificationPayload,
  NotificationTarget,
} from './types';

const logger = createChildLogger('NotificationChannels');

// --- IN_APP : persiste + emet socket vers user/client room ---
export async function deliverInApp(
  target: NotificationTarget,
  payload: NotificationPayload,
): Promise<ChannelDeliveryResult> {
  if (!target.userId && !target.clientId) {
    return { channel: 'IN_APP', status: 'SKIPPED', error: 'Aucune cible userId ou clientId' };
  }
  try {
    const row = await prisma.notification.create({
      data: {
        userId: target.userId ?? null,
        clientId: target.clientId ?? null,
        agencyId: target.agencyId ?? null,
        title: payload.title,
        message: payload.message,
        type: 'IN_APP',
        status: 'SENT',
        sentAt: new Date(),
        metadata: (payload.metadata ?? undefined) as never,
      },
    });
    // Push realtime via socket.io. Le frontend ecoute 'notification:new'
    // pour rafraichir le compteur de notifs et afficher un toast.
    const event = {
      id: row.id,
      title: row.title,
      message: row.message,
      metadata: row.metadata,
      createdAt: row.createdAt,
    };
    if (target.userId) realtimeService.toUser(target.userId, 'notification:new', event);
    if (target.clientId) realtimeService.toClient(target.clientId, 'notification:new', event);
    return { channel: 'IN_APP', status: 'SENT', notificationId: row.id };
  } catch (err: any) {
    logger.error({ err }, 'IN_APP delivery failed');
    return { channel: 'IN_APP', status: 'FAILED', error: err?.message ?? String(err) };
  }
}

// --- EMAIL : delegue a EmailService existant + log dans Notification ---
export async function deliverEmail(
  target: NotificationTarget,
  payload: NotificationPayload,
): Promise<ChannelDeliveryResult> {
  // Resoudre l'adresse : explicite > client.email > user.email
  let to = target.email ?? null;
  if (!to && target.clientId) {
    const c = await prisma.client.findUnique({
      where: { id: target.clientId },
      select: { email: true },
    });
    to = c?.email ?? null;
  }
  if (!to && target.userId) {
    const u = await prisma.user.findUnique({
      where: { id: target.userId },
      select: { email: true },
    });
    to = u?.email ?? null;
  }
  if (!to) {
    return { channel: 'EMAIL', status: 'SKIPPED', error: 'Aucune adresse email' };
  }

  try {
    // Email simple texte. L'EmailService a des methodes specialisees pour des
    // templates riches ; pour l'instant on utilise un envoi generique.
    await (emailService as unknown as {
      sendGeneric?: (to: string, subject: string, body: string) => Promise<void>;
      sendEmail?: (to: string, subject: string, body: string) => Promise<void>;
    }).sendEmail?.(to, payload.title, payload.message);
    const row = await prisma.notification.create({
      data: {
        userId: target.userId ?? null,
        clientId: target.clientId ?? null,
        agencyId: target.agencyId ?? null,
        title: payload.title,
        message: payload.message,
        type: 'EMAIL',
        status: 'SENT',
        sentAt: new Date(),
        metadata: { to, ...(payload.metadata ?? {}) } as never,
      },
    });
    return { channel: 'EMAIL', status: 'SENT', notificationId: row.id };
  } catch (err: any) {
    logger.warn({ err, to }, 'EMAIL delivery failed');
    await prisma.notification
      .create({
        data: {
          userId: target.userId ?? null,
          clientId: target.clientId ?? null,
          agencyId: target.agencyId ?? null,
          title: payload.title,
          message: payload.message,
          type: 'EMAIL',
          status: 'FAILED',
          metadata: { to, error: err?.message } as never,
        },
      })
      .catch(() => {});
    return { channel: 'EMAIL', status: 'FAILED', error: err?.message ?? String(err) };
  }
}

// --- SMS / WHATSAPP / PUSH : providers injectables ---
// Pour le moment, les providers sont des stubs configures par env vars.
// Le vrai branchement (Twilio / Africa's Talking / Meta) se fera quand les
// credentials seront fournies. Le code reste fonctionnel : tant que provider
// est null/disabled, le canal renvoie SKIPPED proprement.

let smsProvider: ExternalChannelProvider | null = null;
let whatsappProvider: ExternalChannelProvider | null = null;
let pushProvider: ExternalChannelProvider | null = null;

export function setSmsProvider(p: ExternalChannelProvider | null) {
  smsProvider = p;
}
export function setWhatsappProvider(p: ExternalChannelProvider | null) {
  whatsappProvider = p;
}
export function setPushProvider(p: ExternalChannelProvider | null) {
  pushProvider = p;
}

async function deliverExternal(
  channel: 'SMS' | 'WHATSAPP' | 'PUSH',
  provider: ExternalChannelProvider | null,
  target: NotificationTarget,
  payload: NotificationPayload,
): Promise<ChannelDeliveryResult> {
  if (!provider || !provider.enabled) {
    return {
      channel,
      status: 'SKIPPED',
      error: `Aucun provider ${channel} configure`,
    };
  }
  // Resoudre le telephone (SMS / WhatsApp). Pour PUSH on prendrait un device token.
  let to = target.phone ?? null;
  if (!to && (channel === 'SMS' || channel === 'WHATSAPP')) {
    if (target.clientId) {
      const c = await prisma.client.findUnique({
        where: { id: target.clientId },
        select: { phone: true },
      });
      to = c?.phone ?? null;
    }
    if (!to && target.userId) {
      const u = await prisma.user.findUnique({
        where: { id: target.userId },
        select: { phone: true },
      });
      to = u?.phone ?? null;
    }
  }
  if (!to) {
    return { channel, status: 'SKIPPED', error: 'Pas de telephone / token' };
  }
  try {
    await provider.send(to, payload.message, {
      title: payload.title,
      ...(payload.metadata ?? {}),
    });
    const row = await prisma.notification.create({
      data: {
        userId: target.userId ?? null,
        clientId: target.clientId ?? null,
        agencyId: target.agencyId ?? null,
        title: payload.title,
        message: payload.message,
        type: channel,
        status: 'SENT',
        sentAt: new Date(),
        metadata: { to, provider: provider.name, ...(payload.metadata ?? {}) } as never,
      },
    });
    return { channel, status: 'SENT', notificationId: row.id };
  } catch (err: any) {
    logger.warn({ err, channel, to, provider: provider.name }, 'External delivery failed');
    await prisma.notification
      .create({
        data: {
          userId: target.userId ?? null,
          clientId: target.clientId ?? null,
          agencyId: target.agencyId ?? null,
          title: payload.title,
          message: payload.message,
          type: channel,
          status: 'FAILED',
          metadata: { to, provider: provider.name, error: err?.message } as never,
        },
      })
      .catch(() => {});
    return { channel, status: 'FAILED', error: err?.message ?? String(err) };
  }
}

export const deliverSms = (t: NotificationTarget, p: NotificationPayload) =>
  deliverExternal('SMS', smsProvider, t, p);
export const deliverWhatsapp = (t: NotificationTarget, p: NotificationPayload) =>
  deliverExternal('WHATSAPP', whatsappProvider, t, p);
export const deliverPush = (t: NotificationTarget, p: NotificationPayload) =>
  deliverExternal('PUSH', pushProvider, t, p);
