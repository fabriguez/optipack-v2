import { eventBus, DomainEvents } from '../EventBus';
import type { DomainEvent } from '../EventBus';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../../config/database';
import { emailService } from '../../email/EmailService';
import { createChildLogger } from '../../../config/logger';

const logger = createChildLogger('NotificationHandler');

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
    await prisma.notification.create({
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
  });

  logger.info('Notification event handlers registered');
}

export { registerHandlers };
