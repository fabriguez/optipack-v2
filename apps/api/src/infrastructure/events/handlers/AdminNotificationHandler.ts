/**
 * Alertes administrateurs sur les evenements de gestion.
 *
 * Complement de NotificationHandler (oriente client) : ici on alimente le fil
 * in-app des administrateurs pour les operations sensibles du backoffice --
 * annulation de paiement, cycle de vie des dettes, colis (modification,
 * suppression, archivage, perte), remise commerciale, virements, changement
 * d'etat d'un conteneur ou d'une facture.
 *
 * Regles :
 *  - Chaque handler est best-effort : une alerte ratee n'annule jamais
 *    l'operation metier (l'EventBus avale deja les exceptions).
 *  - `notifyAdmins` = IN_APP seul ; `notifyAdminsEmail` = IN_APP + email,
 *    reserve aux evenements a fort impact (annulation de paiement, dettes).
 *  - Les notifications client restent portees par NotificationHandler ou par
 *    `notificationService` appele explicitement ici (dettes).
 */
import { eventBus, DomainEvents } from '../EventBus';
import type { DomainEvent } from '../EventBus';
import { prisma } from '../../../config/database';
import { createChildLogger } from '../../../config/logger';
import { notificationService } from '../../../application/services/notifications/NotificationService';
import { notifyAdmins, notifyAdminsEmail } from '../../../application/services/notifications/adminAlerts';

const logger = createChildLogger('AdminNotificationHandler');

/** Montant lisible : "125 000 XAF". */
function money(value: unknown): string {
  const n = Number(value ?? 0);
  return `${Number.isFinite(n) ? n.toLocaleString('fr-FR') : '0'} XAF`;
}

function shortDate(value: unknown): string {
  if (!value) return '-';
  const d = new Date(value as string);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString('fr-FR');
}

const DEBT_TYPE_LABELS: Record<string, string> = {
  CLIENT: 'client',
  EMPLOYEE: 'employe',
  AGENCY: 'agence',
  CARRIER: 'transporteur',
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'Especes',
  MOBILE_MONEY: 'Mobile Money',
  BANK_TRANSFER: 'Virement',
  CARD: 'Carte bancaire',
  CHECK: 'Cheque',
};

/** Nom du client, vide si inconnu (jamais bloquant). */
async function clientName(clientId?: string | null): Promise<string> {
  if (!clientId) return '';
  try {
    const c = await prisma.client.findUnique({
      where: { id: clientId },
      select: { fullName: true },
    });
    return c?.fullName ?? '';
  } catch {
    return '';
  }
}

/** Nom complet de l'auteur de l'action, pour tracer "qui a fait quoi". */
async function actorName(userId?: string | null): Promise<string> {
  if (!userId) return 'Systeme';
  try {
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true, email: true },
    });
    if (!u) return 'Utilisateur inconnu';
    const full = `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim();
    return full || u.email;
  } catch {
    return 'Utilisateur inconnu';
  }
}

/** Lignes "cle : valeur" -> corps HTML simple pour les emails admin. */
function htmlBody(intro: string, rows: [string, string][]): string {
  const lines = rows
    .map(([k, v]) => `<li style="margin:4px 0"><strong>${k}</strong> : ${v}</li>`)
    .join('');
  return (
    `<p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#4B5563">${intro}</p>` +
    `<ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.6;color:#4B5563">${lines}</ul>`
  );
}

// ---------------------------------------------------------------------------
// Paiements
// ---------------------------------------------------------------------------

function registerPaymentHandlers(): void {
  // Annulation d'un paiement : les administrateurs sont prevenus par email
  // (exigence metier) en plus de l'alerte in-app.
  eventBus.on(DomainEvents.PAYMENT_VOIDED, async (event: DomainEvent) => {
    const p = event.payload as Record<string, any>;
    const author = await actorName(p.voidedByUserId ?? event.userId);
    const name = await clientName(p.clientId);
    const title = 'Paiement annule';
    const message =
      `Le paiement ${p.paymentRef ?? p.paymentId} de ${money(p.amount)}` +
      `${p.invoiceRef ? ` (facture ${p.invoiceRef})` : ''}` +
      `${name ? ` - client ${name}` : ''} a ete annule par ${author}. Motif : ${p.reason ?? '-'}.`;

    await notifyAdminsEmail({
      agencyId: p.agencyId ?? event.agencyId,
      title,
      message,
      eventKind: 'PAYMENT_VOIDED',
      metadata: {
        paymentId: p.paymentId,
        invoiceId: p.invoiceId,
        amount: p.amount,
        reason: p.reason,
      },
      emailHtml: htmlBody('Un paiement vient d\'etre annule dans le backoffice.', [
        ['Reference paiement', String(p.paymentRef ?? p.paymentId ?? '-')],
        ['Montant', money(p.amount)],
        ['Mode', PAYMENT_METHOD_LABELS[p.paymentMethod] ?? String(p.paymentMethod ?? '-')],
        ['Facture', String(p.invoiceRef ?? '-')],
        ['Client', name || '-'],
        ['Encaisse le', shortDate(p.paymentCreatedAt)],
        ['Annule par', author],
        ['Motif', String(p.reason ?? '-')],
      ]),
    });
  });

  // Changement d'etat d'une facture (UNPAID / PARTIAL / PAID).
  eventBus.on(DomainEvents.INVOICE_STATUS_CHANGED, async (event: DomainEvent) => {
    const p = event.payload as Record<string, any>;
    const name = await clientName(p.clientId);
    await notifyAdmins({
      agencyId: p.agencyId ?? event.agencyId,
      title: 'Statut de facture modifie',
      message:
        `La facture ${p.invoiceRef ?? p.invoiceId}${name ? ` (${name})` : ''} passe de ` +
        `${p.statusBefore ?? '-'} a ${p.statusAfter ?? '-'}. Solde : ${money(p.balance)}.`,
      eventKind: 'INVOICE_STATUS_CHANGED',
      metadata: {
        invoiceId: p.invoiceId,
        statusBefore: p.statusBefore,
        statusAfter: p.statusAfter,
      },
    });
  });

  // Remise commerciale accordee (ou retiree) sur la facture d'un colis.
  eventBus.on(DomainEvents.INVOICE_DISCOUNT_APPLIED, async (event: DomainEvent) => {
    const p = event.payload as Record<string, any>;
    const author = await actorName(event.userId);
    const name = await clientName(p.clientId);
    const removed = Number(p.newDiscount ?? 0) <= 0;
    const parcelLabel = p.trackingNumber
      ? `${p.designation ?? 'Colis'} (${p.trackingNumber})`
      : null;

    await notifyAdmins({
      agencyId: p.agencyId ?? event.agencyId,
      title: removed ? 'Remise retiree' : 'Remise accordee',
      message:
        `${author} a ${removed ? 'retire la remise' : `accorde une remise de ${money(p.newDiscount)}`} ` +
        `sur la facture ${p.invoiceRef ?? p.invoiceId}` +
        `${parcelLabel ? ` - ${parcelLabel}` : ''}${name ? ` - client ${name}` : ''}. ` +
        `Motif : ${p.reason ?? '-'}. Net a payer : ${money(p.netAmount)}.`,
      eventKind: 'INVOICE_DISCOUNT_APPLIED',
      metadata: {
        invoiceId: p.invoiceId,
        parcelId: p.parcelId,
        previousDiscount: p.previousDiscount,
        newDiscount: p.newDiscount,
        reason: p.reason,
      },
    });
  });
}

// ---------------------------------------------------------------------------
// Dettes
// ---------------------------------------------------------------------------

/**
 * Notifie le client d'un evenement de dette. Sans clientId (dettes internes
 * employe / agence / transporteur) il n'y a pas de destinataire : on sort.
 */
async function notifyDebtClient(args: {
  clientId?: string | null;
  agencyId?: string | null;
  organizationId?: string | null;
  title: string;
  message: string;
  eventKind: string;
  metadata: Record<string, unknown>;
}): Promise<void> {
  if (!args.clientId) return;
  try {
    await notificationService.notify(
      {
        clientId: args.clientId,
        agencyId: args.agencyId ?? null,
        organizationId: args.organizationId ?? null,
      },
      {
        title: args.title,
        message: args.message,
        channels: ['IN_APP', 'EMAIL', 'WHATSAPP'],
        metadata: { ...args.metadata, kind: args.eventKind },
      },
    );
  } catch (err) {
    logger.warn({ err, eventKind: args.eventKind }, 'Notification client dette echouee (non bloquant)');
  }
}

function registerDebtHandlers(): void {
  // Creation d'une dette : le client est prevenu (tous canaux) et les
  // administrateurs recoivent l'alerte in-app + email.
  eventBus.on(DomainEvents.DEBT_CREATED, async (event: DomainEvent) => {
    const p = event.payload as Record<string, any>;
    const name = await clientName(p.clientId);
    const author = await actorName(event.userId);
    const typeLabel = DEBT_TYPE_LABELS[p.debtType] ?? String(p.debtType ?? '').toLowerCase();
    const dueDate = p.nextDueDate ?? p.dueDateFinal;

    await notifyDebtClient({
      clientId: p.clientId,
      agencyId: p.agencyId,
      organizationId: p.organizationId,
      title: 'Nouvelle dette enregistree',
      message:
        `Bonjour ${name}, une dette de ${money(p.totalAmount)} a ete enregistree a votre nom ` +
        `(reference ${p.debtRef}${p.motif ? `, motif : ${p.motif}` : ''})` +
        `${dueDate ? `. Echeance : ${shortDate(dueDate)}` : ''}.`,
      eventKind: 'DEBT_CREATED',
      metadata: { debtId: p.debtId, debtRef: p.debtRef, amount: p.totalAmount },
    });

    await notifyAdminsEmail({
      agencyId: p.agencyId ?? event.agencyId,
      organizationId: p.organizationId,
      title: 'Nouvelle dette creee',
      message:
        `Dette ${typeLabel} ${p.debtRef} de ${money(p.totalAmount)} creee par ${author}` +
        `${name ? ` pour ${name}` : ''}${p.motif ? ` - motif : ${p.motif}` : ''}` +
        `${dueDate ? ` - echeance ${shortDate(dueDate)}` : ''}.`,
      eventKind: 'DEBT_CREATED',
      metadata: { debtId: p.debtId, debtRef: p.debtRef, amount: p.totalAmount },
      emailHtml: htmlBody('Une dette vient d\'etre creee.', [
        ['Reference', String(p.debtRef ?? '-')],
        ['Type', typeLabel || '-'],
        ['Montant', money(p.totalAmount)],
        ['Debiteur', name || '-'],
        ['Motif', String(p.motif ?? '-')],
        ['Echeance', shortDate(dueDate)],
        ['Creee par', author],
      ]),
    });
  });

  // Paiement d'une dette : le client est deja notifie par NotificationHandler,
  // on complete avec l'alerte administrateur.
  eventBus.on(DomainEvents.DEBT_PAYMENT_RECEIVED, async (event: DomainEvent) => {
    const p = event.payload as Record<string, any>;
    const name = await clientName(p.clientId);
    const author = await actorName(event.userId);
    const cleared = Number(p.remainingAmount ?? 0) <= 0;

    await notifyAdminsEmail({
      agencyId: p.agencyId ?? event.agencyId,
      organizationId: p.organizationId,
      title: 'Paiement de dette enregistre',
      message:
        `Paiement de ${money(p.amount)} sur la dette ${p.debtRef}` +
        `${name ? ` (${name})` : ''} enregistre par ${author}. ` +
        (cleared ? 'La dette est soldee.' : `Solde restant : ${money(p.remainingAmount)}.`),
      eventKind: 'DEBT_PAYMENT_RECEIVED_ADMIN',
      metadata: { debtId: p.debtId, paymentId: p.paymentId, amount: p.amount },
      emailHtml: htmlBody('Un paiement de dette vient d\'etre enregistre.', [
        ['Dette', String(p.debtRef ?? '-')],
        ['Debiteur', name || '-'],
        ['Montant', money(p.amount)],
        ['Mode', PAYMENT_METHOD_LABELS[p.paymentMethod] ?? String(p.paymentMethod ?? '-')],
        ['Solde restant', cleared ? '0 XAF (soldee)' : money(p.remainingAmount)],
        ['Enregistre par', author],
      ]),
    });
  });

  // Echeance proche : le client est notifie par le cron, les administrateurs
  // gardent une trace in-app pour le suivi du recouvrement.
  eventBus.on(DomainEvents.DEBT_DUE_SOON, async (event: DomainEvent) => {
    const p = event.payload as Record<string, any>;
    const name = await clientName(p.clientId);
    await notifyAdminsEmail({
      agencyId: p.agencyId ?? event.agencyId,
      organizationId: p.organizationId,
      title: 'Echeance de dette proche',
      message:
        `La dette ${p.debtRef}${name ? ` (${name})` : ''} arrive a echeance le ` +
        `${shortDate(p.nextDueDate)}. Reste du : ${money(p.remainingAmount)}.`,
      eventKind: 'DEBT_DUE_SOON_ADMIN',
      metadata: { debtId: p.debtId, debtRef: p.debtRef, nextDueDate: p.nextDueDate },
      emailHtml: htmlBody('Une echeance de dette arrive a terme.', [
        ['Dette', String(p.debtRef ?? '-')],
        ['Debiteur', name || '-'],
        ['Echeance', shortDate(p.nextDueDate)],
        ['Reste du', money(p.remainingAmount)],
        ['Priorite', String(p.priority ?? '-')],
      ]),
    });
  });

  // Annulation d'une dette.
  eventBus.on(DomainEvents.DEBT_CANCELLED, async (event: DomainEvent) => {
    const p = event.payload as Record<string, any>;
    const name = await clientName(p.clientId);
    const author = await actorName(event.userId);

    await notifyAdmins({
      agencyId: p.agencyId ?? event.agencyId,
      organizationId: p.organizationId,
      title: 'Dette annulee',
      message:
        `La dette ${p.debtRef} de ${money(p.totalAmount)}${name ? ` (${name})` : ''} ` +
        `a ete annulee par ${author}. Motif : ${p.reason ?? '-'}.`,
      eventKind: 'DEBT_CANCELLED',
      metadata: { debtId: p.debtId, debtRef: p.debtRef, reason: p.reason },
    });

    await notifyDebtClient({
      clientId: p.clientId,
      agencyId: p.agencyId,
      organizationId: p.organizationId,
      title: 'Dette annulee',
      message:
        `Bonjour ${name}, votre dette ${p.debtRef} de ${money(p.totalAmount)} a ete annulee. ` +
        `Vous n'avez plus rien a regler a ce titre.`,
      eventKind: 'DEBT_CANCELLED',
      metadata: { debtId: p.debtId, debtRef: p.debtRef },
    });
  });

  // Changement d'etat d'une dette (paiement partiel, litige, ...).
  eventBus.on(DomainEvents.DEBT_STATUS_CHANGED, async (event: DomainEvent) => {
    const p = event.payload as Record<string, any>;
    const name = await clientName(p.clientId);
    await notifyAdmins({
      agencyId: p.agencyId ?? event.agencyId,
      organizationId: p.organizationId,
      title: 'Statut de dette modifie',
      message:
        `La dette ${p.debtRef}${name ? ` (${name})` : ''} passe de ${p.statusBefore ?? '-'} ` +
        `a ${p.statusAfter ?? '-'}${p.reason ? ` - ${p.reason}` : ''}. ` +
        `Reste du : ${money(p.remainingAmount)}.`,
      eventKind: 'DEBT_STATUS_CHANGED',
      metadata: {
        debtId: p.debtId,
        statusBefore: p.statusBefore,
        statusAfter: p.statusAfter,
      },
    });
  });
}

// ---------------------------------------------------------------------------
// Colis
// ---------------------------------------------------------------------------

function registerParcelHandlers(): void {
  eventBus.on(DomainEvents.PARCEL_DELETED, async (event: DomainEvent) => {
    const p = event.payload as Record<string, any>;
    const author = await actorName(event.userId);
    await notifyAdmins({
      agencyId: p.agencyId ?? event.agencyId,
      organizationId: p.organizationId,
      title: 'Colis supprime',
      message:
        `${author} a supprime le colis ${p.designation ?? ''} (${p.trackingNumber ?? p.parcelId}), ` +
        `statut ${p.statusBefore ?? '-'}.`,
      eventKind: 'PARCEL_DELETED',
      metadata: { parcelId: p.parcelId, trackingNumber: p.trackingNumber },
    });
  });

  eventBus.on(DomainEvents.PARCEL_UPDATED, async (event: DomainEvent) => {
    const p = event.payload as Record<string, any>;
    const fields = Array.isArray(p.changedFields) ? p.changedFields : [];
    // Un update sans changement effectif (aucun champ modifie) n'interesse
    // personne : on evite de polluer le fil.
    if (fields.length === 0) return;
    const author = await actorName(event.userId);
    await notifyAdmins({
      agencyId: p.agencyId ?? event.agencyId,
      organizationId: p.organizationId,
      title: 'Colis modifie',
      message:
        `${author} a modifie le colis ${p.designation ?? ''} (${p.trackingNumber ?? p.parcelId}). ` +
        `Champs : ${fields.join(', ')}.`,
      eventKind: 'PARCEL_UPDATED',
      metadata: { parcelId: p.parcelId, changes: p.changes },
    });
  });

  const archiveHandler = (archived: boolean) => async (event: DomainEvent) => {
    const p = event.payload as Record<string, any>;
    const author = await actorName(event.userId);
    const refs = Array.isArray(p.trackingNumbers) ? p.trackingNumbers : [];
    const preview = refs.slice(0, 5).join(', ');
    const suffix = refs.length > 5 ? ` (+${refs.length - 5})` : '';
    await notifyAdmins({
      agencyId: p.agencyId ?? event.agencyId,
      organizationId: p.organizationId,
      title: archived ? 'Colis archives' : 'Colis desarchives',
      message:
        `${author} a ${archived ? 'archive' : 'desarchive'} ${p.count ?? refs.length} colis` +
        `${preview ? ` : ${preview}${suffix}` : ''}` +
        `${p.reason ? `. Motif : ${p.reason}` : ''}.`,
      eventKind: archived ? 'PARCEL_ARCHIVED' : 'PARCEL_UNARCHIVED',
      metadata: { parcelIds: p.parcelIds, count: p.count, reason: p.reason },
    });
  };
  eventBus.on(DomainEvents.PARCEL_ARCHIVED, archiveHandler(true));
  eventBus.on(DomainEvents.PARCEL_UNARCHIVED, archiveHandler(false));

  eventBus.on(DomainEvents.PARCEL_LOST, async (event: DomainEvent) => {
    const p = event.payload as Record<string, any>;
    const author = await actorName(event.userId);
    const name = await clientName(p.clientId);
    await notifyAdminsEmail({
      agencyId: p.agencyId ?? event.agencyId,
      organizationId: p.organizationId,
      title: 'Colis declare perdu',
      message:
        `Le colis ${p.designation ?? ''} (${p.trackingNumber ?? p.parcelId})` +
        `${name ? ` du client ${name}` : ''} a ete declare perdu par ${author} ` +
        `(statut precedent : ${p.statusBefore ?? '-'}).`,
      eventKind: 'PARCEL_LOST',
      metadata: { parcelId: p.parcelId, trackingNumber: p.trackingNumber },
      emailHtml: htmlBody('Un colis vient d\'etre declare perdu.', [
        ['Colis', String(p.designation ?? '-')],
        ['Numero de suivi', String(p.trackingNumber ?? '-')],
        ['Client', name || '-'],
        ['Statut precedent', String(p.statusBefore ?? '-')],
        ['Declare par', author],
      ]),
    });
  });
}

// ---------------------------------------------------------------------------
// Conteneurs et virements
// ---------------------------------------------------------------------------

function registerLogisticsHandlers(): void {
  eventBus.on(DomainEvents.CONTAINER_STATUS_CHANGED, async (event: DomainEvent) => {
    const p = event.payload as Record<string, any>;
    const author = await actorName(event.userId);
    await notifyAdmins({
      agencyId: p.agencyId ?? event.agencyId,
      title: 'Statut de conteneur modifie',
      message:
        `Le conteneur ${p.designation ?? p.containerId} passe de ${p.statusBefore ?? '-'} ` +
        `a ${p.statusAfter ?? '-'} (${author})` +
        `${p.parcelCount != null ? ` - ${p.parcelCount} colis` : ''}.`,
      eventKind: 'CONTAINER_STATUS_CHANGED',
      metadata: {
        containerId: p.containerId,
        statusBefore: p.statusBefore,
        statusAfter: p.statusAfter,
      },
    });
  });

  /**
   * Virements : le payload de l'event ne porte que l'id, on relit la ligne
   * pour disposer de la reference et des agences source / destination. Les
   * deux agences sont alertees quand elles different.
   */
  const transferHandler = (
    kind: 'FUND_TRANSFER_CREATED' | 'FUND_TRANSFER_CONFIRMED' | 'FUND_TRANSFER_VOIDED',
    title: string,
    verb: string,
  ) => async (event: DomainEvent) => {
    const p = event.payload as Record<string, any>;
    const transferId = p.transferId as string | undefined;
    if (!transferId) return;

    const transfer = await prisma.fundTransfer.findUnique({
      where: { id: transferId },
      select: {
        reference: true,
        amount: true,
        status: true,
        sourceAgencyId: true,
        sourceOrganizationId: true,
        destinationAgencyId: true,
        destinationLabel: true,
        destinationType: true,
        sourceAgency: { select: { name: true } },
        destinationAgency: { select: { name: true } },
      },
    });
    if (!transfer) {
      logger.warn({ transferId, kind }, 'Virement introuvable : alerte admin ignoree');
      return;
    }

    const author = await actorName(event.userId);
    const from = transfer.sourceAgency?.name ?? 'Siege';
    const to = transfer.destinationAgency?.name ?? transfer.destinationLabel ?? transfer.destinationType;
    const message =
      `Virement ${transfer.reference} de ${money(transfer.amount)} (${from} vers ${to}) ` +
      `${verb} par ${author}${p.reason ? `. Motif : ${p.reason}` : ''}.`;

    const targets = new Set(
      [transfer.sourceAgencyId, transfer.destinationAgencyId].filter(
        (id): id is string => !!id,
      ),
    );
    // Virement au depart du siege : pas d'agence source, on cible l'organisation.
    if (targets.size === 0) {
      await notifyAdmins({
        organizationId: transfer.sourceOrganizationId,
        title,
        message,
        eventKind: kind,
        metadata: { transferId, reference: transfer.reference, amount: Number(transfer.amount) },
      });
      return;
    }
    for (const agencyId of targets) {
      await notifyAdmins({
        agencyId,
        title,
        message,
        eventKind: kind,
        metadata: { transferId, reference: transfer.reference, amount: Number(transfer.amount) },
      });
    }
  };

  eventBus.on(
    DomainEvents.FUND_TRANSFER_CREATED,
    transferHandler('FUND_TRANSFER_CREATED', 'Virement initie', 'initie'),
  );
  eventBus.on(
    DomainEvents.FUND_TRANSFER_CONFIRMED,
    transferHandler('FUND_TRANSFER_CONFIRMED', 'Virement confirme', 'confirme'),
  );
  eventBus.on(
    DomainEvents.FUND_TRANSFER_VOIDED,
    transferHandler('FUND_TRANSFER_VOIDED', 'Virement annule', 'annule'),
  );
}

export function registerAdminNotificationHandlers(): void {
  registerPaymentHandlers();
  registerDebtHandlers();
  registerParcelHandlers();
  registerLogisticsHandlers();
  logger.info('Admin notification handlers registered');
}
