import { eventBus, DomainEvents } from '../EventBus';
import type { DomainEvent } from '../EventBus';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../../config/database';
import { config } from '../../../config';
import { emailService } from '../../email/EmailService';
import { createChildLogger } from '../../../config/logger';
import { realtimeService } from '../../realtime/RealtimeService';
import { notificationService } from '../../../application/services/notifications/NotificationService';
import type {
  NotificationAttachment,
  NotificationChannel,
  NotificationPayload,
  NotificationTarget,
} from '../../../application/services/notifications/types';
import { filterChannelsByPrefs } from '../../../application/services/notifications/preferences';
import { minioClient } from '../../../config/minio';
import {
  buildInvoicePdfBuffer,
  buildPaymentReceiptPdfBuffer,
} from '../../../presentation/routes/v1/invoice.routes';

const logger = createChildLogger('NotificationHandler');

/**
 * Resout l'organizationId a partir d'un agencyId. Memoise pendant la vie du
 * process : un agencyId ne change pas d'organisation.
 */
const agencyOrgCache = new Map<string, string>();
async function getOrgFromAgency(agencyId?: string | null): Promise<string | null> {
  if (!agencyId) return null;
  const cached = agencyOrgCache.get(agencyId);
  if (cached) return cached;
  const a = await prisma.agency.findUnique({
    where: { id: agencyId },
    select: { organizationId: true },
  });
  if (a?.organizationId) {
    agencyOrgCache.set(agencyId, a.organizationId);
    return a.organizationId;
  }
  return null;
}

/**
 * Resolution organizationId pour un event : payload > event.organizationId
 * > resolve depuis agencyId. Centralise pour eviter les divergences entre
 * handlers.
 */
async function resolveEventOrg(event: DomainEvent, payload: Record<string, any>): Promise<string | null> {
  return (
    payload.organizationId ||
    (event as any).organizationId ||
    (await getOrgFromAgency(payload.agencyId || (event as any).agencyId))
  );
}

/**
 * Upload un buffer PDF dans MinIO (tmp/notif/) et retourne une URL presignee
 * valide 30 minutes. L'URL utilise MINIO_PUBLIC_BASE_URL si defini (requis
 * pour que WhatsApp puisse telecharger le fichier depuis internet).
 * Retourne null sur toute erreur (envoi WhatsApp se fait sans piece jointe).
 */
async function uploadPdfForWhatsApp(
  buffer: Buffer,
  filename: string,
): Promise<string | null> {
  try {
    const bucket = config.minio.bucket;
    const key = `tmp/notif/${Date.now()}-${filename}`;
    await minioClient.putObject(bucket, key, buffer, buffer.length, {
      'Content-Type': 'application/pdf',
    });
    const signed = await (minioClient as any).presignedGetObject(bucket, key, 1800);
    if (config.minio.publicBaseUrl) {
      const parsedSigned = new URL(signed);
      const parsedPublic = new URL(config.minio.publicBaseUrl);
      parsedSigned.protocol = parsedPublic.protocol;
      parsedSigned.hostname = parsedPublic.hostname;
      parsedSigned.port = parsedPublic.port;
      return parsedSigned.toString();
    }
    return signed;
  } catch (err) {
    logger.warn({ err, filename }, 'uploadPdfForWhatsApp failed (piece jointe ignoree)');
    return null;
  }
}

async function dispatchExternal(
  target: NotificationTarget,
  payload: { title: string; message: string; metadata?: Record<string, unknown>; kind?: string; attachments?: NotificationAttachment[] },
): Promise<void> {
  const requested: NotificationChannel[] = ['SMS', 'WHATSAPP', 'PUSH'];
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
      metadata: { ...(payload.metadata ?? {}), kind: payload.kind ?? payload.metadata?.kind },
      channels: allowed,
      attachments: payload.attachments,
    });
  } catch (err) {
    logger.warn({ err, title: payload.title }, 'Echec dispatch externe (non bloquant)');
  }
}

async function createNotification(data: {
  clientId?: string;
  userId?: string;
  agencyId?: string;
  organizationId?: string | null;
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

async function getAgencyAdminEmails(agencyId: string): Promise<string[]> {
  try {
    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        email: { not: '' },
        role: { in: ['ADMIN', 'SUPER_ADMIN'] as any },
        userAgencies: { some: { agencyId } },
      },
      select: { email: true },
    });
    return users.map((u) => u.email).filter(Boolean) as string[];
  } catch (e) {
    return [];
  }
}

async function getAgencyAdmins(agencyId: string): Promise<{ id: string; email: string; phone: string | null }[]> {
  try {
    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        email: { not: '' },
        role: { in: ['ADMIN', 'SUPER_ADMIN'] as any },
        userAgencies: { some: { agencyId } },
      },
      select: { id: true, email: true, phone: true },
    });
    return users.filter(u => u.email) as { id: string; email: string; phone: string | null }[];
  } catch {
    return [];
  }
}

function registerHandlers() {
  // PARCEL_CREATED
  eventBus.on(DomainEvents.PARCEL_CREATED, async (event: DomainEvent) => {
    const payload = event.payload as Record<string, any>;
    const { clientId, agencyId, trackingNumber, designation, destination, weight, volume, transitType, price } = payload;
    if (!clientId) return;

    const organizationId = await resolveEventOrg(event, payload);

    await createNotification({
      clientId,
      agencyId: agencyId || event.agencyId,
      organizationId,
      title: 'Colis enregistre',
      message: `Votre colis "${designation || ''}" a ete enregistre avec le numero de suivi ${trackingNumber || ''}.`,
      metadata: { trackingNumber, parcelId: payload.parcelId, kind: 'PARCEL_CREATED' } as Prisma.InputJsonValue,
    });

    const email = await getClientEmail(clientId);
    if (email) {
      await emailService.sendParcelCreated(
        email,
        trackingNumber || '',
        designation || '',
        destination || '',
        weight ?? null,
        Number(price || 0).toLocaleString('fr-FR') + ' XAF',
        organizationId,
        { volume: volume ?? null, transitType: transitType ?? null },
      );
    }

    // Copies admins agence
    const adminEmails = agencyId ? await getAgencyAdminEmails(agencyId) : [];
    for (const e of adminEmails) {
      await emailService.send(
        e,
        `Nouveau colis ${trackingNumber || ''}`,
        `<p>Colis <strong>${designation || ''}</strong> enregistre.<br/>Suivi : <strong>${trackingNumber || ''}</strong></p>`,
        organizationId,
        { event: 'PARCEL_CREATED_ADMIN' },
      );
    }

    {
      const w = weight != null && Number(weight) > 0 ? `\nMasse : ${weight} kg` : '';
      const v = volume != null && Number(volume) > 0 ? `\nVolume : ${volume} m³` : '';
      const waMsg =
        `Colis enregistre\n\n` +
        `Designation : ${designation || '-'}\n` +
        `Destination : ${destination || '-'}` +
        w + v +
        `\nPrix : ${price ? Number(price).toLocaleString('fr-FR') + ' XAF' : '-'}` +
        `\nN° suivi : ${trackingNumber || '-'}` +
        `\n\nSuivez votre colis : ${config.webUrl}/tracking/${trackingNumber || ''}`;
      await dispatchExternal(
        { clientId, agencyId: agencyId || event.agencyId, organizationId },
        { title: 'Colis enregistre', message: waMsg, metadata: { trackingNumber, parcelId: payload.parcelId }, kind: 'PARCEL_CREATED' },
      );
    }
  });

  // PARCEL_STATUS_CHANGED (IN_TRANSIT / ARRIVED / DELIVERED / RECEIVED / LOADING)
  eventBus.on(DomainEvents.PARCEL_STATUS_CHANGED, async (event: DomainEvent) => {
    const payload = event.payload as Record<string, any>;
    const { clientId, agencyId, trackingNumber, designation, newStatus } = payload;
    if (!clientId) return;
    const organizationId = await resolveEventOrg(event, payload);

    const titles: Record<string, { title: string; kind: string }> = {
      LOADING: { title: 'Colis en chargement', kind: 'PARCEL_LOADING' },
      IN_TRANSIT: { title: 'Colis en transit', kind: 'PARCEL_IN_TRANSIT' },
      ARRIVED: { title: 'Colis arrive', kind: 'PARCEL_ARRIVED' },
      RECEIVED: { title: 'Colis receptionne', kind: 'PARCEL_RECEIVED' },
      DELIVERED: { title: 'Colis livre', kind: 'PARCEL_DELIVERED' },
    };
    const meta = titles[newStatus];
    if (!meta) return; // statut non notifiable

    await createNotification({
      clientId,
      agencyId: agencyId || event.agencyId,
      organizationId,
      title: meta.title,
      message: `Votre colis "${designation || ''}" (${trackingNumber || ''}) : ${meta.title.toLowerCase()}.`,
      metadata: { trackingNumber, newStatus, kind: meta.kind } as Prisma.InputJsonValue,
    });

    const email = await getClientEmail(clientId);
    if (email) {
      await emailService.sendParcelStatusChanged(
        email,
        trackingNumber || '',
        designation || '',
        newStatus,
        organizationId,
      );
    }

    // Copies admins pour les changements significatifs
    if (['IN_TRANSIT', 'ARRIVED', 'DELIVERED'].includes(newStatus)) {
      const adminEmails = agencyId ? await getAgencyAdminEmails(agencyId) : [];
      for (const e of adminEmails) {
        await emailService.send(
          e,
          `${meta.title} - ${trackingNumber || ''}`,
          `<p>Colis <strong>${designation || ''}</strong> (${trackingNumber || ''}) statut : <strong>${newStatus}</strong></p>`,
          organizationId,
          { event: `${meta.kind}_ADMIN` },
        );
      }
    }

    // Notifications externes (SMS / WhatsApp / Push) sur les jalons cles du
    // cycle de vie : recu, expedie (en transit), arrive, livre.
    const trackUrl = `${config.webUrl}/tracking/${trackingNumber || ''}`;
    const externalBodies: Record<string, string> = {
      RECEIVED:
        `Statut : Receptionne\n\n` +
        `Designation : ${designation || '-'}\nN° suivi : ${trackingNumber || '-'}\n\n` +
        `Votre colis a bien ete receptionne dans nos locaux.\n\nSuivre : ${trackUrl}`,
      IN_TRANSIT:
        `Statut : En transit\n\n` +
        `Designation : ${designation || '-'}\nN° suivi : ${trackingNumber || '-'}\n\n` +
        `Votre colis est en route vers sa destination.\n\nSuivre : ${trackUrl}`,
      ARRIVED:
        `Statut : Arrive a destination\n\n` +
        `Designation : ${designation || '-'}\nN° suivi : ${trackingNumber || '-'}\n\n` +
        `Votre colis est arrive et disponible au retrait.\n\nSuivre : ${trackUrl}`,
      DELIVERED:
        `Statut : Livre\n\n` +
        `Designation : ${designation || '-'}\nN° suivi : ${trackingNumber || '-'}\n\n` +
        `Votre colis a ete livre. Merci de votre confiance.\n\nSuivre : ${trackUrl}`,
    };
    if (externalBodies[newStatus]) {
      await dispatchExternal(
        { clientId, agencyId: agencyId || event.agencyId, organizationId },
        { title: meta.title, message: externalBodies[newStatus], metadata: { trackingNumber, newStatus }, kind: meta.kind },
      );
    }
  });

  // PARCEL_DELIVERED -> notification dediee retrait (au cas ou un service emet
  // l'evenement specifique au lieu de PARCEL_STATUS_CHANGED).
  eventBus.on(DomainEvents.PARCEL_DELIVERED, async (event: DomainEvent) => {
    const payload = event.payload as Record<string, any>;
    const { clientId, agencyId, trackingNumber, designation, agencyName } = payload;
    if (!clientId) return;
    const organizationId = await resolveEventOrg(event, payload);

    await createNotification({
      clientId,
      agencyId: agencyId || event.agencyId,
      organizationId,
      title: 'Colis retire',
      message: `Vous avez retire votre colis "${designation || ''}" (${trackingNumber || ''}).`,
      metadata: { trackingNumber, kind: 'PARCEL_WITHDRAWN' } as Prisma.InputJsonValue,
    });

    const email = await getClientEmail(clientId);
    if (email) {
      await emailService.sendParcelWithdrawn(
        email,
        trackingNumber || '',
        designation || '',
        agencyName || '',
        organizationId,
      );
    }

    await dispatchExternal(
      { clientId, agencyId: agencyId || event.agencyId, organizationId },
      {
        title: 'Colis retire',
        message:
          `Colis retire\n\n` +
          `Designation : ${designation || '-'}\nN° suivi : ${trackingNumber || '-'}\nAgence : ${agencyName || '-'}\n\n` +
          `Livraison finalisee. Merci de votre confiance.`,
        kind: 'PARCEL_WITHDRAWN',
      },
    );
  });

  // PAYMENT_RECEIVED
  eventBus.on(DomainEvents.PAYMENT_RECEIVED, async (event: DomainEvent) => {
    const payload = event.payload as Record<string, any>;
    const { clientId, agencyId, amount, invoiceRef, agencyName, paymentMethod, remainingBalance } = payload;
    if (!clientId) return;
    const organizationId = await resolveEventOrg(event, payload);

    await createNotification({
      clientId,
      agencyId: agencyId || event.agencyId,
      organizationId,
      title: 'Paiement recu',
      message: `Votre paiement de ${amount || ''} a ete recu pour la facture ${invoiceRef || ''}.`,
      metadata: { invoiceRef, amount, kind: 'PAYMENT_RECEIVED' } as Prisma.InputJsonValue,
    });

    const email = await getClientEmail(clientId);
    if (email) {
      await emailService.sendPaymentReceived(
        email,
        String(amount || ''),
        invoiceRef || '',
        agencyName || '',
        paymentMethod || '',
        String(remainingBalance || '0'),
        organizationId,
      );
    }

    {
      const methodLabels: Record<string, string> = {
        CASH: 'Especes', MOBILE_MONEY: 'Mobile Money',
        BANK_TRANSFER: 'Virement', CARD: 'Carte bancaire', CHECK: 'Cheque',
      };

      // Generer les pieces jointes PDF (recu + facture) pour WhatsApp.
      const attachments: NotificationAttachment[] = [];
      try {
        const refSlug = (invoiceRef || 'facture').replace(/[^a-zA-Z0-9-]/g, '-');

        // 1. Recu de paiement : trouver le paiement le plus recent pour cette facture.
        const latestPayment = await prisma.payment.findFirst({
          where: { invoice: { reference: invoiceRef }, isVoided: false },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        });
        if (latestPayment) {
          const receiptResult = await buildPaymentReceiptPdfBuffer(latestPayment.id);
          if (receiptResult) {
            const url = await uploadPdfForWhatsApp(receiptResult.pdf, `recu-${refSlug}.pdf`);
            if (url) attachments.push({ url, filename: `Recu-${refSlug}.pdf`, caption: `Recu de paiement - ${invoiceRef}` });
          }
        }

        // 2. Facture complete.
        const invoiceRow = await prisma.invoice.findFirst({
          where: { reference: invoiceRef },
          select: { id: true },
        });
        if (invoiceRow) {
          const invoiceResult = await buildInvoicePdfBuffer(invoiceRow.id);
          if (invoiceResult) {
            const url = await uploadPdfForWhatsApp(invoiceResult.pdf, `facture-${refSlug}.pdf`);
            if (url) attachments.push({ url, filename: `Facture-${refSlug}.pdf`, caption: `Facture ${invoiceRef}` });
          }
        }
      } catch (err) {
        logger.warn({ err, invoiceRef }, 'PDF generation for WhatsApp attachment failed (ignored)');
      }

      await dispatchExternal(
        { clientId, agencyId: agencyId || event.agencyId, organizationId },
        {
          title: 'Paiement recu',
          message:
            `Paiement recu\n\n` +
            `Montant : ${amount || '-'} FCFA\nFacture : ${invoiceRef || '-'}\n` +
            `Mode : ${methodLabels[paymentMethod] || paymentMethod || '-'}\nAgence : ${agencyName || '-'}\n` +
            `Solde restant : ${remainingBalance || '0'} FCFA\n\nMerci pour votre paiement.`,
          metadata: { invoiceRef, amount, paymentMethod },
          kind: 'PAYMENT_RECEIVED',
          attachments: attachments.length > 0 ? attachments : undefined,
        },
      );
    }
  });

  // PENALTY_APPLIED
  eventBus.on(DomainEvents.PENALTY_APPLIED, async (event: DomainEvent) => {
    const payload = event.payload as Record<string, any>;
    const { clientId, agencyId, trackingNumber, designation, days, dailyRate, totalAmount, agencyName } = payload;
    if (!clientId) return;
    const organizationId = await resolveEventOrg(event, payload);

    await createNotification({
      clientId,
      agencyId: agencyId || event.agencyId,
      organizationId,
      title: 'Penalite appliquee',
      message: `Une penalite de stockage de ${totalAmount || ''} a ete appliquee sur votre colis "${designation || ''}" (${trackingNumber || ''}).`,
      metadata: { trackingNumber, totalAmount, days, kind: 'PENALTY_APPLIED' } as Prisma.InputJsonValue,
    });

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
        organizationId,
      );
    }

    await dispatchExternal(
      { clientId, agencyId: agencyId || event.agencyId, organizationId },
      {
        title: 'Penalite de stockage',
        message:
          `Penalite de stockage\n\n` +
          `Designation : ${designation || '-'}\nN° suivi : ${trackingNumber || '-'}\n` +
          `Jours en attente : ${days || 0}\nTaux journalier : ${dailyRate || '-'} XAF\n` +
          `Penalite : ${totalAmount || '-'} FCFA\nAgence : ${agencyName || '-'}\n\n` +
          `Recuperez votre colis au plus vite pour eviter des frais supplementaires.`,
        metadata: { trackingNumber, totalAmount, days },
        kind: 'PENALTY_APPLIED',
      },
    );
  });

  // STORAGE_CHARGE_STARTED -> debut des frais de magasinage
  eventBus.on(DomainEvents.STORAGE_CHARGE_STARTED, async (event: DomainEvent) => {
    const payload = event.payload as Record<string, any>;
    const { parcelId, agencyId, phase, freeDays, dailyRate } = payload;
    const rate = Number(dailyRate || 0);
    if (!parcelId || rate <= 0) return;

    // Resolution colis + client (l'event ne porte que des ids techniques).
    const parcel = await prisma.parcel.findUnique({
      where: { id: parcelId },
      select: { clientId: true, trackingNumber: true, designation: true, organizationId: true },
    });
    if (!parcel?.clientId) return;
    const organizationId = parcel.organizationId ?? (await resolveEventOrg(event, payload));

    const free = Number(freeDays || 0);
    const graceTxt = free > 0 ? `${free} jour(s) gratuit(s), puis ` : '';
    const phaseTxt = phase === 'DESTINATION' ? 'a destination' : 'en magasin';
    const message =
      `Votre colis "${parcel.designation || ''}" (${parcel.trackingNumber || ''}) est en magasinage ${phaseTxt}. ` +
      `${graceTxt}${rate} FCFA/jour. Retirez-le au plus tot pour eviter des frais.`;

    await createNotification({
      clientId: parcel.clientId,
      agencyId,
      organizationId,
      title: 'Debut des frais de magasinage',
      message,
      metadata: { trackingNumber: parcel.trackingNumber, phase, freeDays: free, dailyRate: rate, kind: 'STORAGE_CHARGE_STARTED' } as Prisma.InputJsonValue,
    });

    const email = await getClientEmail(parcel.clientId);
    if (email) {
      await emailService.send(
        email,
        `Debut des frais de magasinage - ${parcel.trackingNumber || ''}`,
        `<p>${message}</p>`,
        organizationId,
        { event: 'STORAGE_CHARGE_STARTED' },
      );
    }

    await dispatchExternal(
      { clientId: parcel.clientId, agencyId, organizationId },
      { title: 'Frais de magasinage', message, metadata: { trackingNumber: parcel.trackingNumber, phase }, kind: 'STORAGE_CHARGE_STARTED' },
    );
  });

  // PARCEL_DELAYED -> retard eventuel (ETA conteneur depassee). Payload enrichi
  // par le cron de detection (clientId, trackingNumber, designation, ETA).
  eventBus.on(DomainEvents.PARCEL_DELAYED, async (event: DomainEvent) => {
    const payload = event.payload as Record<string, any>;
    const { clientId, agencyId, trackingNumber, designation, estimatedArrivalDate } = payload;
    if (!clientId) return;
    const organizationId = await resolveEventOrg(event, payload);

    const etaTxt = estimatedArrivalDate
      ? ` (arrivee estimee : ${new Date(estimatedArrivalDate).toLocaleDateString('fr-FR')})`
      : '';
    const message =
      `Votre colis "${designation || ''}" (${trackingNumber || ''}) connait un retard d'acheminement${etaTxt}. ` +
      `Nos equipes suivent la situation, merci de votre patience.`;

    await createNotification({
      clientId,
      agencyId: agencyId || event.agencyId,
      organizationId,
      title: 'Retard de votre colis',
      message,
      metadata: { trackingNumber, estimatedArrivalDate, kind: 'PARCEL_DELAYED' } as Prisma.InputJsonValue,
    });

    const email = await getClientEmail(clientId);
    if (email) {
      await emailService.send(
        email,
        `Retard de votre colis - ${trackingNumber || ''}`,
        `<p>${message}</p>`,
        organizationId,
        { event: 'PARCEL_DELAYED' },
      );
    }

    await dispatchExternal(
      { clientId, agencyId: agencyId || event.agencyId, organizationId },
      { title: 'Retard de votre colis', message, metadata: { trackingNumber }, kind: 'PARCEL_DELAYED' },
    );
  });

  // NOTIFICATION_SEND
  eventBus.on(DomainEvents.NOTIFICATION_SEND, async (event: DomainEvent) => {
    const { target, payload } = event.payload as {
      target?: NotificationTarget;
      payload?: NotificationPayload;
    };
    if (!target || !payload) {
      logger.warn({ payload: event.payload }, 'Notification send event invalid');
      return;
    }
    await notificationService.notify(target, payload);
  });

  // PARCEL_LOADED -> template enrichi avec nom du conteneur
  eventBus.on(DomainEvents.PARCEL_LOADED, async (event: DomainEvent) => {
    const payload = event.payload as Record<string, any>;
    const { parcelId, clientId, trackingNumber, designation, containerName, agencyId } = payload;
    if (!clientId) return;
    const organizationId = await resolveEventOrg(event, payload);

    await createNotification({
      clientId,
      agencyId: agencyId || event.agencyId,
      organizationId,
      title: 'Colis charge',
      message: `Votre colis "${designation || ''}" (${trackingNumber || ''}) a ete charge${containerName ? ` dans ${containerName}` : ''}.`,
      metadata: { parcelId, trackingNumber, containerName, kind: 'PARCEL_LOADED' } as Prisma.InputJsonValue,
    });

    const email = await getClientEmail(clientId);
    if (email) {
      await emailService.sendParcelLoaded(
        email,
        trackingNumber || '',
        designation || '',
        containerName || 'le conteneur',
        organizationId,
      );
    }

    await dispatchExternal(
      { clientId, agencyId: agencyId || event.agencyId, organizationId },
      {
        title: 'Colis charge',
        message:
          `Colis charge\n\n` +
          `Designation : ${designation || '-'}\nN° suivi : ${trackingNumber || '-'}\n` +
          `Conteneur : ${containerName || '-'}\n\n` +
          `Le depart du conteneur sera notifie sous peu.\n\nSuivre : ${config.webUrl}/tracking/${trackingNumber || ''}`,
        kind: 'PARCEL_LOADED',
      },
    );
  });

  // PARCEL_UNLOADED -> template enrichi par action
  eventBus.on(DomainEvents.PARCEL_UNLOADED, async (event: DomainEvent) => {
    const payload = event.payload as Record<string, any>;
    const { parcelId, clientId, action, trackingNumber, designation, agencyName, agencyId } = payload;
    if (!clientId) return;
    const organizationId = await resolveEventOrg(event, payload);

    const labels: Record<string, string> = {
      received: 'Colis decharge',
      not_found: 'Colis non retrouve',
      modified: 'Colis mis a jour',
    };
    const title = labels[action] || 'Colis mis a jour';
    const message = action === 'received'
      ? `Votre colis (${trackingNumber || ''}) a ete decharge et est disponible en magasin.`
      : action === 'not_found'
      ? `Nous n'avons pas retrouve votre colis (${trackingNumber || ''}) lors du dechargement.`
      : `Votre colis (${trackingNumber || ''}) a ete mis a jour lors du dechargement.`;

    await createNotification({
      clientId,
      agencyId: agencyId || event.agencyId,
      organizationId,
      title,
      message,
      metadata: { parcelId, trackingNumber, action, kind: 'PARCEL_UNLOADED' } as Prisma.InputJsonValue,
    });

    const email = await getClientEmail(clientId);
    if (email) {
      await emailService.sendParcelUnloaded(
        email,
        trackingNumber || '',
        designation || '',
        (action as 'received' | 'not_found' | 'modified') || 'modified',
        agencyName || '',
        organizationId,
      );
    }

    {
      const statusDetail = action === 'received'
        ? `Votre colis est disponible et peut etre retire aux heures d'ouverture.`
        : action === 'not_found'
        ? `Notre equipe enquete et vous tiendra informe.`
        : `Consultez votre espace pour voir les modifications.`;
      const waMsg =
        `${title}\n\n` +
        `Designation : ${designation || '-'}\nN° suivi : ${trackingNumber || '-'}\nAgence : ${agencyName || '-'}\n\n` +
        `${statusDetail}\n\nSuivre : ${config.webUrl}/tracking/${trackingNumber || ''}`;
      await dispatchExternal(
        { clientId, agencyId: agencyId || event.agencyId, organizationId },
        { title, message: waMsg, kind: 'PARCEL_UNLOADED' },
      );
    }
  });

  // CONTAINER_DEPARTED -> admins agence
  eventBus.on(DomainEvents.CONTAINER_DEPARTED, async (event: DomainEvent) => {
    const payload = event.payload as Record<string, any>;
    const { containerId, parcelCount } = payload;
    try {
      const container = await prisma.container.findUnique({ where: { id: containerId } });
      if (!container) return;
      const agencyId = container.departureAgencyId || event.agencyId;
      const organizationId = await getOrgFromAgency(agencyId);

      await createNotification({
        agencyId: agencyId ?? undefined,
        organizationId,
        title: 'Conteneur parti',
        message: `Le conteneur ${container.designation || container.id} est parti avec ${parcelCount || 0} colis.`,
        metadata: { containerId, parcelCount, kind: 'CONTAINER_DEPARTED' } as Prisma.InputJsonValue,
      });

      const admins = agencyId ? await getAgencyAdmins(agencyId) : [];
      for (const a of admins) {
        await emailService.send(
          a.email,
          `Conteneur ${container.designation || container.id} parti`,
          `<p>Depart : <strong>${container.designation || container.id}</strong></p><p>Colis embarques : <strong>${parcelCount || 0}</strong></p>`,
          organizationId,
          { event: 'CONTAINER_DEPARTED' },
        );
        if (a.phone) {
          await notificationService.notify(
            { userId: a.id, phone: a.phone, organizationId: organizationId ?? undefined },
            {
              title: 'Conteneur parti',
              message: `Conteneur ${container.designation || container.id} est parti avec ${parcelCount || 0} colis.`,
              channels: ['WHATSAPP'],
              metadata: { containerId, parcelCount, kind: 'CONTAINER_DEPARTED' },
            },
          ).catch(() => {});
        }
      }
    } catch (err) {
      logger.warn({ err }, 'Erreur handler CONTAINER_DEPARTED');
    }
  });

  // CONTAINER_ARRIVED -> admins agence
  eventBus.on(DomainEvents.CONTAINER_ARRIVED, async (event: DomainEvent) => {
    const payload = event.payload as Record<string, any>;
    const { containerId, parcelCount } = payload;
    try {
      const container = await prisma.container.findUnique({ where: { id: containerId } });
      if (!container) return;
      const agencyId = container.arrivalAgencyId || event.agencyId;
      const organizationId = await getOrgFromAgency(agencyId);

      await createNotification({
        agencyId: agencyId ?? undefined,
        organizationId,
        title: 'Conteneur arrive',
        message: `Le conteneur ${container.designation || container.id} est arrive. ${parcelCount || 0} colis a decharger.`,
        metadata: { containerId, parcelCount, kind: 'CONTAINER_ARRIVED' } as Prisma.InputJsonValue,
      });

      const admins = agencyId ? await getAgencyAdmins(agencyId) : [];
      for (const a of admins) {
        await emailService.send(
          a.email,
          `Conteneur ${container.designation || container.id} arrive`,
          `<p>Arrivee : <strong>${container.designation || container.id}</strong></p><p>Colis a decharger : <strong>${parcelCount || 0}</strong></p>`,
          organizationId,
          { event: 'CONTAINER_ARRIVED' },
        );
        if (a.phone) {
          await notificationService.notify(
            { userId: a.id, phone: a.phone, organizationId: organizationId ?? undefined },
            {
              title: 'Conteneur arrive',
              message: `Conteneur ${container.designation || container.id} arrive. ${parcelCount || 0} colis a decharger.`,
              channels: ['WHATSAPP'],
              metadata: { containerId, parcelCount, kind: 'CONTAINER_ARRIVED' },
            },
          ).catch(() => {});
        }
      }
    } catch (err) {
      logger.warn({ err }, 'Erreur handler CONTAINER_ARRIVED');
    }
  });

  // INVOICE_CREATED -> client + admins, template riche
  eventBus.on(DomainEvents.INVOICE_CREATED, async (event: DomainEvent) => {
    const payload = event.payload as Record<string, any>;
    const { invoiceId, reference, clientId, agencyId, totalAmount, currency } = payload;
    try {
      const organizationId = await resolveEventOrg(event, payload);
      if (clientId) {
        await createNotification({
          clientId,
          agencyId: agencyId || event.agencyId,
          organizationId,
          title: 'Nouvelle facture',
          message: `Votre facture ${reference || ''} a ete creee. Montant : ${totalAmount || ''}.`,
          metadata: { invoiceId, reference, totalAmount, kind: 'INVOICE_CREATED' } as Prisma.InputJsonValue,
        });

        const email = await getClientEmail(clientId);
        if (email) {
          await emailService.sendInvoiceCreated(
            email,
            reference || '',
            Number(totalAmount || 0).toLocaleString(),
            currency || 'XAF',
            organizationId,
          );
        }

        await dispatchExternal(
          { clientId, agencyId: agencyId || event.agencyId, organizationId },
          {
            title: 'Nouvelle facture',
            message:
              `Nouvelle facture\n\n` +
              `Reference : ${reference || '-'}\nMontant : ${Number(totalAmount || 0).toLocaleString()} ${currency || 'XAF'}\n\n` +
              `Consultez et reglez votre facture depuis votre espace : ${config.webUrl}/invoices`,
            metadata: { invoiceId, reference, totalAmount },
            kind: 'INVOICE_CREATED',
          },
        );
      }

      const admins = agencyId ? await getAgencyAdminEmails(agencyId) : [];
      for (const a of admins) {
        await emailService.send(
          a,
          `Facture creee ${reference || ''}`,
          `<p>Facture <strong>${reference || ''}</strong> creee pour le client.</p><p>Montant : <strong>${Number(totalAmount || 0).toLocaleString()} ${currency || 'XAF'}</strong></p>`,
          organizationId,
          { event: 'INVOICE_CREATED_ADMIN' },
        );
      }
    } catch (err) {
      logger.warn({ err }, 'Erreur handler INVOICE_CREATED');
    }
  });

  // INVOICE_PAID
  eventBus.on(DomainEvents.INVOICE_PAID, async (event: DomainEvent) => {
    const payload = event.payload as Record<string, any>;
    const { reference, clientId, agencyId, totalAmount, currency } = payload;
    if (!clientId) return;
    const organizationId = await resolveEventOrg(event, payload);

    await createNotification({
      clientId,
      agencyId: agencyId || event.agencyId,
      organizationId,
      title: 'Facture reglee',
      message: `Votre facture ${reference || ''} est entierement reglee.`,
      metadata: { reference, kind: 'INVOICE_PAID' } as Prisma.InputJsonValue,
    });

    const email = await getClientEmail(clientId);
    if (email) {
      await emailService.send(
        email,
        `Facture reglee - ${reference || ''}`,
        `<p>Votre facture <strong>${reference || ''}</strong> est entierement reglee.</p><p>Montant total : <strong>${Number(totalAmount || 0).toLocaleString()} ${currency || 'XAF'}</strong></p><p>Merci pour votre confiance.</p>`,
        organizationId,
        { event: 'INVOICE_PAID' },
      );
    }

    // Piece jointe PDF de la facture reglee pour WhatsApp.
    const invoicePaidAttachments: NotificationAttachment[] = [];
    try {
      const refSlug = (reference || 'facture').replace(/[^a-zA-Z0-9-]/g, '-');
      const invoiceRow = await prisma.invoice.findFirst({
        where: { reference },
        select: { id: true },
      });
      if (invoiceRow) {
        const result = await buildInvoicePdfBuffer(invoiceRow.id);
        if (result) {
          const url = await uploadPdfForWhatsApp(result.pdf, `facture-${refSlug}.pdf`);
          if (url) invoicePaidAttachments.push({ url, filename: `Facture-${refSlug}.pdf`, caption: `Facture ${reference} - reglee` });
        }
      }
    } catch (err) {
      logger.warn({ err, reference }, 'PDF generation INVOICE_PAID WhatsApp failed (ignored)');
    }

    await dispatchExternal(
      { clientId, agencyId: agencyId || event.agencyId, organizationId },
      {
        title: 'Facture reglee',
        message:
          `Facture entierement reglee\n\n` +
          `Reference : ${reference || '-'}\nMontant total : ${Number(totalAmount || 0).toLocaleString()} ${currency || 'XAF'}\n\n` +
          `Merci pour votre paiement. Consultez votre espace : ${config.webUrl}/invoices`,
        metadata: { reference, totalAmount },
        kind: 'INVOICE_PAID',
        attachments: invoicePaidAttachments.length > 0 ? invoicePaidAttachments : undefined,
      },
    );
  });

  // CLIENT_LOYALTY_UPDATED -> template riche
  eventBus.on(DomainEvents.CLIENT_LOYALTY_UPDATED, async (event: DomainEvent) => {
    const payload = event.payload as Record<string, any>;
    const { clientId, points, delta, reason, agencyId } = payload;
    if (!clientId) return;
    const organizationId = await resolveEventOrg(event, payload);

    try {
      const title = 'Points de fidelite mis a jour';
      const message = `Vos points de fidelite ont ete mis a jour (${delta || 0}). Nouveau solde : ${points || 0}.` + (reason ? ` Raison : ${reason}` : '');

      await createNotification({
        clientId,
        agencyId: agencyId || event.agencyId,
        organizationId,
        title,
        message,
        metadata: { points, delta, reason, kind: 'CLIENT_LOYALTY_UPDATED' } as Prisma.InputJsonValue,
      });

      const email = await getClientEmail(clientId);
      if (email) {
        await emailService.sendLoyaltyPointsUpdated(
          email,
          Number(delta || 0),
          Number(points || 0),
          reason || '',
          organizationId,
        );
      }

      {
        const positive = Number(delta || 0) >= 0;
        const waMsg =
          `Points de fidelite mis a jour\n\n` +
          `Variation : ${positive ? '+' : ''}${delta || 0} pts\nNouveau solde : ${points || 0} pts\n` +
          (reason ? `Motif : ${reason}\n` : '') +
          `\nCumulez des points a chaque envoi.\nVoir mon solde : ${config.webUrl}/loyalty`;
        await dispatchExternal(
          { clientId, agencyId: agencyId || event.agencyId, organizationId },
          { title, message: waMsg, metadata: { points, delta, reason }, kind: 'CLIENT_LOYALTY_UPDATED' },
        );
      }

      const admins = agencyId ? await getAgencyAdminEmails(agencyId) : [];
      for (const a of admins) {
        await emailService.send(
          a,
          `Fidelite client mise a jour`,
          `<p>Client <code>${clientId}</code> : <strong>${points} pts</strong> (delta : ${delta})</p>`,
          organizationId,
          { event: 'LOYALTY_UPDATED_ADMIN' },
        );
      }
    } catch (err) {
      logger.warn({ err }, 'Erreur handler CLIENT_LOYALTY_UPDATED');
    }
  });

  logger.info('Notification event handlers registered');
}

export { registerHandlers };
