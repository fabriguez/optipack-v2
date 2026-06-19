import { prisma } from '../../../config/database';
import type { NotificationChannel } from './types';

/**
 * Résout et rend un template de notification personnalisé pour un tenant.
 *
 * Syntaxe : {{variable}} dans les body/subject. Pas de logique conditionnelle —
 * le template est un texte plat avec des placeholders simples.
 *
 * Si aucun template personnalisé n'existe pour le triplet
 * (organizationId, eventKind, channel), les fonctions retournent null et
 * le code appelant doit utiliser le message par défaut du système.
 */

export interface RenderedTemplate {
  subject?: string;
  body: string;
  /** Pièces jointes configurées : { invoice: bool, receipt: bool } */
  attachments?: Record<string, boolean>;
}

/** Remplace tous les {{key}} du template par les valeurs du contexte. */
function renderTemplate(template: string, context: Record<string, string | number | undefined | null>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = context[key];
    return val !== undefined && val !== null ? String(val) : '';
  });
}

/**
 * Résout le template personnalisé pour un triplet (org, event, canal).
 * Retourne null si aucun template actif n'existe — le caller utilise alors
 * le message par défaut du système.
 */
export async function resolveTemplate(
  organizationId: string | null | undefined,
  eventKind: string | undefined,
  channel: NotificationChannel,
  context: Record<string, string | number | undefined | null>,
): Promise<RenderedTemplate | null> {
  if (!organizationId || !eventKind) return null;

  const tmpl = await prisma.tenantNotificationTemplate.findUnique({
    where: {
      organizationId_eventKind_channel: {
        organizationId,
        eventKind,
        channel,
      },
    },
  });

  if (!tmpl || !tmpl.isActive) return null;

  return {
    subject: tmpl.subject ? renderTemplate(tmpl.subject, context) : undefined,
    body: renderTemplate(tmpl.body, context),
    attachments: (tmpl.attachments as Record<string, boolean> | null) ?? undefined,
  };
}
