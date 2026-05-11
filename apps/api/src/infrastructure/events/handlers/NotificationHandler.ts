import { eventBus, DomainEvents } from '../EventBus';
import type { DomainEvent } from '../EventBus';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../../config/database';
import { emailService } from '../../email/EmailService';
import { createChildLogger } from '../../../config/logger';
import { realtimeService } from '../../realtime/RealtimeService';
import { notificationService } from '../../../application/services/notifications/NotificationService';
import type { NotificationChannel } from '../../../application/services/notifications/types';
import { filterChannelsByPrefs } from '../../../application/services/notifications/preferences';

/**
 * Pousse une notification multi-canal hors IN_APP/EMAIL (deja geres
 * separement par cette unite pour conserver les templates riches d'email).
 * Inclut par defaut SMS + WHATSAPP : les providers SKIPPED retournent
 * simplement, donc aucun cout si non configures.
 */
async function dispatchExternal(
  target: { clientId?: string | null; userId?: string | null; agencyId?: string | null },
  payload: { title: string; message: string; metadata?: Record<string, unknown>; kind?: string },
): Promise<void> {
  const requested: NotificationChannel[] = ['SMS', 'WHATSAPP'];
  const allowed = await filterChannelsByPrefs(
    target,
    payload.kind ?? (payload.metadata?.kind as string | undefined),
    requested,
  );
  if (allowed.length === 0) return;
  try {
    await notificationService.notify(target, {
      title: payload.title,
      message: payload.message,
      metadata: payload.metadata,
      channels: allowed,
    });
  } catch (err) {
    logger.warn({ err, title: payload.title }, 'Echec dispatch externe (non bloquant)');
  }
}

const logger = createChildLogger('NotificationHandler');

/**
 * Cree la notification IN_APP et la pousse en temps-reel via socket.io.
 * Les notifications EMAIL/SMS/WHATSAPP sont envoyees separement par les
 * handlers d'evenements pour conserver les templates riches existants.
 *
 * Pour un envoi multi-canal complet (recommande pour les nouveaux events),
 * passer par `notificationService.notify(...)` dans
 * `application/services/notifications/NotificationService`.
 */
async function createNotification(data: {
  clientId?: string;
  userId?: string;
  agencyId?: string;
  title: string;
  message: string;
  type?: string;
  metadata?: Prisma.InputJsonValue;
}) {
  try {
    const row = await prisma.notification.create({
      data: {
        clientId: data.clientId,
        userId: data.userId,
        agencyId: data.agencyId,
        title: data.title,
        message: data.message,
        type: (data.type as any) || 'IN_APP',
        status: 'SENT',
        sentAt: new Date(),
        metadata: data.metadata || undefined,
      },
    });
    // Push realtime : vers le user concerne (agent) et/ou le client (portail).
    const event = {
      id: row.id,
      title: row.title,
      message: row.message,
      metadata: row.metadata,
      createdAt: row.createdAt,
    };
    if (data.userId) realtimeService.toUser(data.userId, 'notification:new', event);
    if (data.clientId) realtimeService.toClient(data.clientId, 'notification:new', event);
    if (data.agencyId && !data.userId && !data.clientId) {
      // Diffusion a tous les utilisateurs de l'agence (cas notif d'agence
      // ex: nouveau colis enregistre dans l'agence).
      realtimeService.toAgency(data.agencyId, 'notification:new', event);
    }
  } catch (err) {
    logger.error({ err, title: data.title }, 'Echec creation notification');
  }
}

async function getClientEmail(clientId: string): Promise<string | null> {
  try {
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { email: true },
    });
    return client?.email || null;
  } catch {
    return null;
  }
}

function registerHandlers() {
  // PARCEL_CREATED -> notify client "Colis enregistre"
  eventBus.on(DomainEvents.PARCEL_CREATED, async (event: DomainEvent) => {
    const { clientId, agencyId, trackingNumber, designation, destination, weight, price } =
      event.payload as Record<string, any>;

    if (!clientId) return;

    await createNotification({
      clientId,
      agencyId: agencyId || event.agencyId,
      title: 'Colis enregistre',
      message: `Votre colis "${designation || ''}" a ete enregistre avec le numero de suivi ${trackingNumber || ''}.`,
      metadata: { trackingNumber, parcelId: event.payload.parcelId } as Prisma.InputJsonValue,
    });

    // Try to send email
    if (clientId) {
      const email = await getClientEmail(clientId);
      if (email) {
        await emailService.sendParcelCreated(
          email,
          trackingNumber || '',
          designation || '',
          destination || '',
          String(weight || ''),
          String(price || ''),
        );
      }
    }

    // SMS / WhatsApp (skipped si providers non configures).
    await dispatchExternal(
      { clientId, agencyId: agencyId || event.agencyId },
      {
        title: 'Colis enregistre',
        message: `Bonjour, votre colis "${designation || ''}" est enregistre. Suivi : ${trackingNumber || ''}.`,
        metadata: { trackingNumber, parcelId: event.payload.parcelId, kind: 'PARCEL_CREATED' },
      },
    );
  });

  // PARCEL_STATUS_CHANGED (ARRIVED) -> notify client "Colis arrive"
  // PARCEL_STATUS_CHANGED (DELIVERED) -> notify client "Colis livre"
  eventBus.on(DomainEvents.PARCEL_STATUS_CHANGED, async (event: DomainEvent) => {
    const { clientId, agencyId, trackingNumber, designation, newStatus } =
      event.payload as Record<string, any>;

    if (!clientId) return;

    if (newStatus === 'ARRIVED') {
      await createNotification({
        clientId,
        agencyId: agencyId || event.agencyId,
        title: 'Colis arrive',
        message: `Votre colis "${designation || ''}" (${trackingNumber || ''}) est arrive a destination.`,
        metadata: { trackingNumber, newStatus } as Prisma.InputJsonValue,
      });
    } else if (newStatus === 'DELIVERED') {
      await createNotification({
        clientId,
        agencyId: agencyId || event.agencyId,
        title: 'Colis livre',
        message: `Votre colis "${designation || ''}" (${trackingNumber || ''}) a ete livre avec succes.`,
        metadata: { trackingNumber, newStatus } as Prisma.InputJsonValue,
      });
    }

    // Try to send email for any status change
    if (clientId && (newStatus === 'ARRIVED' || newStatus === 'DELIVERED')) {
      const email = await getClientEmail(clientId);
      if (email) {
        await emailService.sendParcelStatusChanged(
          email,
          trackingNumber || '',
          designation || '',
          newStatus,
        );
      }
    }

    // SMS / WhatsApp pour les changements significatifs.
    if (newStatus === 'ARRIVED') {
      await dispatchExternal(
        { clientId, agencyId: agencyId || event.agencyId },
        {
          title: 'Colis arrive',
          message: `Votre colis "${designation || ''}" (${trackingNumber || ''}) est arrive a destination. Vous pouvez venir le retirer.`,
          metadata: { trackingNumber, newStatus, kind: 'PARCEL_ARRIVED' },
        },
      );
    } else if (newStatus === 'DELIVERED') {
      await dispatchExternal(
        { clientId, agencyId: agencyId || event.agencyId },
        {
          title: 'Colis livre',
          message: `Votre colis "${designation || ''}" (${trackingNumber || ''}) a ete livre. Merci de votre confiance.`,
          metadata: { trackingNumber, newStatus, kind: 'PARCEL_DELIVERED' },
        },
      );
    }
  });

  // PAYMENT_RECEIVED -> notify client "Paiement recu"
  eventBus.on(DomainEvents.PAYMENT_RECEIVED, async (event: DomainEvent) => {
    const { clientId, agencyId, amount, invoiceRef, agencyName, paymentMethod, remainingBalance } =
      event.payload as Record<string, any>;

    if (!clientId) return;

    await createNotification({
      clientId,
      agencyId: agencyId || event.agencyId,
      title: 'Paiement recu',
      message: `Votre paiement de ${amount || ''} a ete recu pour la facture ${invoiceRef || ''}.`,
      metadata: { invoiceRef, amount } as Prisma.InputJsonValue,
    });

    // Try to send email
    const email = await getClientEmail(clientId);
    if (email) {
      await emailService.sendPaymentReceived(
        email,
        String(amount || ''),
        invoiceRef || '',
        agencyName || '',
        paymentMethod || '',
        String(remainingBalance || '0'),
      );
    }

    // SMS / WhatsApp pour reglement.
    await dispatchExternal(
      { clientId, agencyId: agencyId || event.agencyId },
      {
        title: 'Paiement recu',
        message: `Paiement de ${amount || ''} FCFA recu pour la facture ${invoiceRef || ''}. Solde restant : ${remainingBalance || '0'} FCFA.`,
        metadata: { invoiceRef, amount, paymentMethod, kind: 'PAYMENT_RECEIVED' },
      },
    );
  });

  // PENALTY_APPLIED -> notify client "Penalite appliquee"
  eventBus.on(DomainEvents.PENALTY_APPLIED, async (event: DomainEvent) => {
    const { clientId, agencyId, trackingNumber, designation, days, dailyRate, totalAmount, agencyName } =
      event.payload as Record<string, any>;

    if (!clientId) return;

    await createNotification({
      clientId,
      agencyId: agencyId || event.agencyId,
      title: 'Penalite appliquee',
      message: `Une penalite de stockage de ${totalAmount || ''} a ete appliquee sur votre colis "${designation || ''}" (${trackingNumber || ''}).`,
      metadata: { trackingNumber, totalAmount, days } as Prisma.InputJsonValue,
    });

    // Try to send email
    const email = await getClientEmail(clientId);
    if (email) {
      await emailService.sendPenaltyAlert(
        email,
        trackingNumber || '',
        designation || '',
        days || 0,
        String(dailyRate || ''),
        String(totalAmount || ''),
        agencyName || '',
      );
    }

    // SMS / WhatsApp pour penalite (critique : impact financier).
    await dispatchExternal(
      { clientId, agencyId: agencyId || event.agencyId },
      {
        title: 'Penalite de stockage',
        message: `Penalite de ${totalAmount || ''} FCFA appliquee sur "${designation || ''}" (${trackingNumber || ''}) -- ${days || 0} jour(s) de stockage depasses.`,
        metadata: { trackingNumber, totalAmount, days, kind: 'PENALTY_APPLIED' },
      },
    );
  });

  logger.info('Notification event handlers registered');
}

export { registerHandlers };
