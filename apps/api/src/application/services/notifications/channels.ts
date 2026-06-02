import { prisma } from '../../../config/database';
import { emailService } from '../../../infrastructure/email/EmailService';
import { logChannelDelivery } from '../../../infrastructure/email/logging';
import { realtimeService } from '../../../infrastructure/realtime/RealtimeService';
import { createChildLogger } from '../../../config/logger';
import type {
  ChannelDeliveryResult,
  ExternalChannelProvider,
  NotificationPayload,
  NotificationTarget,
} from './types';

const logger = createChildLogger('NotificationChannels');

/**
 * Resout l'organizationId du tenant pour router le mail vers le bon provider.
 * Ordre : target.organizationId > client.organizationId > user.organizationId
 *       > agency.organizationId. Si tout echoue, renvoie null (=> shared).
 */
async function resolveOrganizationId(
  target: NotificationTarget,
): Promise<string | null> {
  if (target.organizationId) return target.organizationId;
  if (target.clientId) {
    const c = await prisma.client.findUnique({
      where: { id: target.clientId },
      select: { organizationId: true },
    });
    if (c?.organizationId) return c.organizationId;
  }
  if (target.userId) {
    const u = await prisma.user.findUnique({
      where: { id: target.userId },
      select: { organizationId: true },
    });
    if (u?.organizationId) return u.organizationId;
  }
  if (target.agencyId) {
    const a = await prisma.agency.findUnique({
      where: { id: target.agencyId },
      select: { organizationId: true },
    });
    if (a?.organizationId) return a.organizationId;
  }
  return null;
}

/**
 * Resout le nom du tenant pour habiller le message in-app / sms / whatsapp
 * d'un entete coherent ("[Acme Transit] ...").
 */
async function resolveTenantName(organizationId: string | null): Promise<string> {
  if (!organizationId) return 'TransitSoftServices';
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { name: true },
  });
  return org?.name || 'TransitSoftServices';
}

/**
 * Habille un message court (in-app, SMS, WhatsApp) avec un entete tenant +
 * pied de page minimal. Pour SMS on tronque le suffix.
 */
function wrapMessage(
  tenantName: string,
  title: string,
  body: string,
  channel: 'IN_APP' | 'SMS' | 'WHATSAPP' | 'PUSH',
): { title: string; message: string } {
  // IN_APP : la UI affiche deja titre + message + tenant, pas besoin de doubler.
  if (channel === 'IN_APP') return { title, message: body };
  if (channel === 'SMS') {
    // SMS : on garde compact (max ~160 chars sur le body wrapper).
    return { title, message: `[${tenantName}] ${body}` };
  }
  // WHATSAPP / PUSH : entete + pied avec branding tenant.
  return {
    title: `[${tenantName}] ${title}`,
    message: `${body}\n\n— ${tenantName} via TransitSoftServices`,
  };
}

// --- IN_APP : persiste + emet socket vers user/client room ---
export async function deliverInApp(
  target: NotificationTarget,
  payload: NotificationPayload,
): Promise<ChannelDeliveryResult> {
  if (!target.userId && !target.clientId) {
    return { channel: 'IN_APP', status: 'SKIPPED', error: 'Aucune cible userId ou clientId' };
  }
  const organizationId = await resolveOrganizationId(target);
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
    const event = {
      id: row.id,
      title: row.title,
      message: row.message,
      metadata: row.metadata,
      createdAt: row.createdAt,
    };
    if (target.userId) realtimeService.toUser(target.userId, 'notification:new', event);
    if (target.clientId) realtimeService.toClient(target.clientId, 'notification:new', event);
    logChannelDelivery({
      status: 'OK',
      channel: 'IN_APP',
      title: payload.title,
      target: target.userId ? `user=${target.userId.slice(0, 8)}` : `client=${target.clientId?.slice(0, 8)}`,
      organizationId,
      event: (payload.metadata?.kind as string | undefined),
    });
    return { channel: 'IN_APP', status: 'SENT', notificationId: row.id };
  } catch (err: any) {
    logger.error({ err }, 'IN_APP delivery failed');
    logChannelDelivery({
      status: 'FAIL',
      channel: 'IN_APP',
      title: payload.title,
      organizationId,
      error: err?.message ?? String(err),
    });
    return { channel: 'IN_APP', status: 'FAILED', error: err?.message ?? String(err) };
  }
}

// --- EMAIL : delegue a EmailService (route via TenantEmailDispatcher) ---
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
    logChannelDelivery({
      status: 'SKIP',
      channel: 'EMAIL',
      title: payload.title,
      error: 'Aucune adresse email',
    });
    return { channel: 'EMAIL', status: 'SKIPPED', error: 'Aucune adresse email' };
  }

  const organizationId = await resolveOrganizationId(target);

  try {
    // payload.message est texte brut -> on l'enveloppe via send() qui appelle
    // emailLayout(). Si l'appelant veut un template riche, il utilise un
    // sendXxx() dedie en amont.
    const ok = await emailService.send(
      to,
      payload.title,
      `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#4B5563">${payload.message}</p>`,
      organizationId,
      { event: (payload.metadata?.kind as string | undefined) ?? 'NOTIFICATION' },
    );
    if (!ok) throw new Error('email dispatcher returned false');
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
        metadata: { to, organizationId, ...(payload.metadata ?? {}) } as never,
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
          metadata: { to, organizationId, error: err?.message } as never,
        },
      })
      .catch(() => {});
    return { channel: 'EMAIL', status: 'FAILED', error: err?.message ?? String(err) };
  }
}

// --- SMS / WHATSAPP / PUSH : providers injectables ---
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
  const organizationId = await resolveOrganizationId(target);
  if (!provider || !provider.enabled) {
    logChannelDelivery({
      status: 'SKIP',
      channel,
      title: payload.title,
      organizationId,
      error: `Aucun provider ${channel} configure`,
    });
    return { channel, status: 'SKIPPED', error: `Aucun provider ${channel} configure` };
  }
  // Resolution des destinataires : tokens push (multi-appareils) pour PUSH,
  // numero de telephone unique pour SMS / WhatsApp.
  let recipients: string[] = [];
  if (channel === 'PUSH') {
    if (target.clientId) {
      const c = await prisma.client.findUnique({
        where: { id: target.clientId },
        select: { pushTokens: true },
      });
      recipients = c?.pushTokens ?? [];
    }
  } else {
    let to = target.phone ?? null;
    if (!to && target.clientId) {
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
    if (to) recipients = [to];
  }
  if (recipients.length === 0) {
    logChannelDelivery({
      status: 'SKIP',
      channel,
      title: payload.title,
      organizationId,
      error: 'Pas de telephone / token',
    });
    return { channel, status: 'SKIPPED', error: 'Pas de telephone / token' };
  }
  const to = recipients.join(',');

  // Habillage tenant header/footer pour SMS/WhatsApp/Push.
  const tenantName = await resolveTenantName(organizationId);
  const wrapped = wrapMessage(tenantName, payload.title, payload.message, channel);

  try {
    // Best-effort multi-destinataires : on tente chaque token/numero ; succes
    // si au moins un aboutit (pertinent pour le push multi-appareils).
    let sentAny = false;
    let lastErr: unknown = null;
    for (const r of recipients) {
      try {
        await provider.send(r, wrapped.message, {
          title: wrapped.title,
          ...(payload.metadata ?? {}),
        });
        sentAny = true;
      } catch (e) {
        lastErr = e;
      }
    }
    if (!sentAny) throw lastErr ?? new Error('Aucun envoi abouti');
    const row = await prisma.notification.create({
      data: {
        userId: target.userId ?? null,
        clientId: target.clientId ?? null,
        agencyId: target.agencyId ?? null,
        title: wrapped.title,
        message: wrapped.message,
        type: channel,
        status: 'SENT',
        sentAt: new Date(),
        metadata: { to, organizationId, provider: provider.name, ...(payload.metadata ?? {}) } as never,
      },
    });
    logChannelDelivery({
      status: 'OK',
      channel,
      title: payload.title,
      target: to,
      organizationId,
      event: (payload.metadata?.kind as string | undefined),
    });
    return { channel, status: 'SENT', notificationId: row.id };
  } catch (err: any) {
    logger.warn({ err, channel, to, provider: provider.name }, 'External delivery failed');
    logChannelDelivery({
      status: 'FAIL',
      channel,
      title: payload.title,
      target: to,
      organizationId,
      error: err?.message ?? String(err),
    });
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
          metadata: { to, organizationId, provider: provider.name, error: err?.message } as never,
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
