/**
 * Alertes administrateurs.
 *
 * Point d'entree unique pour prevenir les administrateurs d'un evenement
 * metier sensible (annulation de paiement, dette, colis perdu, virement...).
 *
 * Deux niveaux :
 *  - `notifyAdmins`      : cree une notification IN_APP par admin (fil du
 *                          centre de notifications + push temps reel).
 *  - `notifyAdminsEmail` : idem + envoi d'un email a chaque admin.
 *
 * Resolution des destinataires : administrateurs actifs rattaches a l'agence
 * concernee ; a defaut (agence inconnue ou aucun admin rattache) tous les
 * administrateurs actifs de l'organisation. Le nombre de destinataires est
 * borne pour ne jamais transformer un evenement en rafale d'emails.
 */
import type { Prisma } from '@prisma/client';
import {
  notificationChannelConfigSchema,
  DEFAULT_NOTIFICATION_CHANNEL_CONFIG,
  DEFAULT_NOTIFICATION_GLOBAL_CHANNELS,
} from '@transitsoftservices/shared';
import { prisma } from '../../../config/database';
import { createChildLogger } from '../../../config/logger';
import { realtimeService } from '../../../infrastructure/realtime/RealtimeService';
import { emailService } from '../../../infrastructure/email/EmailService';

const logger = createChildLogger('AdminAlerts');

/** Roles consideres comme administrateurs du tenant. */
const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN'] as const;

/** Garde-fou : au-dela, on considere la cible mal resolue et on tronque. */
const MAX_ADMIN_RECIPIENTS = 25;

export interface AdminRecipient {
  id: string;
  email: string | null;
  phone: string | null;
}

export interface AdminAlertInput {
  /** Agence concernee. Sert a cibler les admins et a scoper la notification. */
  agencyId?: string | null;
  /** Organisation. Resolue depuis l'agence si absente. */
  organizationId?: string | null;
  title: string;
  message: string;
  /** Nature de l'evenement (PAYMENT_VOIDED, DEBT_CREATED, ...). */
  eventKind: string;
  metadata?: Record<string, unknown>;
  /** Corps HTML de l'email. Defaut : `message` en paragraphe simple. */
  emailHtml?: string;
}

/** organizationId d'une agence, memoise (une agence ne change pas de tenant). */
const orgByAgency = new Map<string, string>();

async function resolveOrganizationId(input: AdminAlertInput): Promise<string | null> {
  if (input.organizationId) return input.organizationId;
  if (!input.agencyId) return null;
  const cached = orgByAgency.get(input.agencyId);
  if (cached) return cached;
  const agency = await prisma.agency.findUnique({
    where: { id: input.agencyId },
    select: { organizationId: true },
  });
  if (agency?.organizationId) {
    orgByAgency.set(input.agencyId, agency.organizationId);
    return agency.organizationId;
  }
  return null;
}

/**
 * Administrateurs a prevenir : ceux de l'agence en priorite, sinon ceux de
 * l'organisation. Retourne une liste vide plutot que de lever : une alerte
 * admin ne doit jamais faire echouer l'operation metier qui la declenche.
 */
export async function resolveAdminRecipients(input: {
  agencyId?: string | null;
  organizationId?: string | null;
}): Promise<AdminRecipient[]> {
  try {
    const select = { id: true, email: true, phone: true };
    if (input.agencyId) {
      const scoped = await prisma.user.findMany({
        where: {
          isActive: true,
          role: { in: ADMIN_ROLES as never },
          userAgencies: { some: { agencyId: input.agencyId } },
        },
        select,
        take: MAX_ADMIN_RECIPIENTS,
      });
      if (scoped.length > 0) return scoped;
    }
    if (!input.organizationId) return [];
    return await prisma.user.findMany({
      where: {
        isActive: true,
        organizationId: input.organizationId,
        role: { in: ADMIN_ROLES as never },
      },
      select,
      take: MAX_ADMIN_RECIPIENTS,
    });
  } catch (err) {
    logger.warn({ err }, 'resolveAdminRecipients failed (aucun destinataire)');
    return [];
  }
}

/**
 * Cree une notification IN_APP par administrateur et la pousse en temps reel.
 * Best-effort : toute erreur est loguee, jamais propagee.
 */
export async function notifyAdmins(input: AdminAlertInput): Promise<AdminRecipient[]> {
  const organizationId = await resolveOrganizationId(input);
  const admins = await resolveAdminRecipients({
    agencyId: input.agencyId,
    organizationId,
  });
  if (admins.length === 0) {
    logger.debug({ eventKind: input.eventKind }, 'Aucun admin a notifier');
    return [];
  }

  const metadata = { ...(input.metadata ?? {}), kind: input.eventKind } as Prisma.InputJsonValue;

  for (const admin of admins) {
    try {
      const row = await prisma.notification.create({
        data: {
          organizationId: organizationId ?? undefined,
          userId: admin.id,
          agencyId: input.agencyId ?? undefined,
          title: input.title,
          message: input.message,
          type: 'IN_APP',
          status: 'SENT',
          eventKind: input.eventKind,
          sentAt: new Date(),
          metadata,
        },
      });
      realtimeService.toUser(admin.id, 'notification:new', {
        id: row.id,
        title: row.title,
        message: row.message,
        metadata: row.metadata,
        createdAt: row.createdAt,
      });
    } catch (err) {
      logger.warn({ err, userId: admin.id, eventKind: input.eventKind }, 'Notification admin IN_APP echouee');
    }
  }

  return admins;
}

/**
 * Le tenant a-t-il laisse le canal EMAIL actif pour cet event ? Meme regle
 * que NotificationService : master switch global, puis override par event.
 * En cas de doute (config illisible, organisation inconnue) on envoie.
 */
async function isEmailEnabled(organizationId: string | null, eventKind: string): Promise<boolean> {
  if (!organizationId) return true;
  try {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { notificationConfig: true },
    });
    const parsed = notificationChannelConfigSchema.safeParse(
      org?.notificationConfig ?? DEFAULT_NOTIFICATION_CHANNEL_CONFIG,
    );
    const cfg = parsed.success ? parsed.data : DEFAULT_NOTIFICATION_CHANNEL_CONFIG;
    const global = cfg.channels ?? DEFAULT_NOTIFICATION_GLOBAL_CHANNELS;
    if (global.email === false) return false;
    return cfg.events?.[eventKind]?.email !== false;
  } catch {
    return true;
  }
}

/**
 * Notification IN_APP + email a chaque administrateur. L'email est
 * best-effort, soumis a la configuration de canaux du tenant, et trace dans
 * le centre de notifications (canal EMAIL).
 */
export async function notifyAdminsEmail(input: AdminAlertInput): Promise<void> {
  const organizationId = await resolveOrganizationId(input);
  const admins = await notifyAdmins({ ...input, organizationId });
  if (!(await isEmailEnabled(organizationId, input.eventKind))) {
    logger.debug({ eventKind: input.eventKind }, 'Canal EMAIL desactive par le tenant : email admin ignore');
    return;
  }
  const html =
    input.emailHtml ??
    `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#4B5563">${input.message}</p>`;

  for (const admin of admins) {
    if (!admin.email) continue;
    let status: 'SENT' | 'FAILED' = 'SENT';
    let error: string | undefined;
    try {
      await emailService.send(admin.email, input.title, html, organizationId, {
        event: input.eventKind,
      });
    } catch (err) {
      status = 'FAILED';
      error = err instanceof Error ? err.message : String(err);
      logger.warn({ err, email: admin.email, eventKind: input.eventKind }, 'Email admin echoue (non bloquant)');
    }
    try {
      await prisma.notification.create({
        data: {
          organizationId: organizationId ?? undefined,
          userId: admin.id,
          agencyId: input.agencyId ?? undefined,
          title: input.title,
          message: input.message,
          type: 'EMAIL',
          status,
          eventKind: input.eventKind,
          recipient: admin.email,
          error,
          sentAt: status === 'SENT' ? new Date() : null,
        },
      });
    } catch (err) {
      logger.warn({ err, eventKind: input.eventKind }, 'Trace email admin non enregistree');
    }
  }
}
