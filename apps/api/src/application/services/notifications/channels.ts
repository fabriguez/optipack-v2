import { prisma } from '../../../config/database';
import { emailService } from '../../../infrastructure/email/EmailService';
import { logChannelDelivery } from '../../../infrastructure/email/logging';
import { realtimeService } from '../../../infrastructure/realtime/RealtimeService';
import { createChildLogger } from '../../../config/logger';
import { resolveTemplate } from './NotificationTemplateRenderer';
import { notificationChannelConfigSchema, type WaMediaMode } from '@transitsoftservices/shared';
import type {
  ChannelDeliveryResult,
  ExternalChannelProvider,
  NotificationAttachment,
  NotificationChannel,
  NotificationPayload,
  NotificationTarget,
} from './types';

const logger = createChildLogger('NotificationChannels');

/**
 * Construit les colonnes communes d'un row Notification, y compris les champs
 * du centre de notifications (organizationId, eventKind, recipient, error,
 * attachments) en plus du metadata historique. DRY : utilise par tous les
 * canaux pour garantir un schema de persistance coherent + rejouable.
 */
function buildNotifRow(args: {
  target: NotificationTarget;
  organizationId: string | null;
  channel: NotificationChannel;
  title: string;
  message: string;
  status: 'SENT' | 'FAILED' | 'PENDING';
  recipient?: string | null;
  error?: string | null;
  provider?: string | null;
  attachments?: NotificationAttachment[];
  metadata?: Record<string, unknown>;
}) {
  const eventKind = (args.metadata?.kind as string | undefined) ?? null;
  const atts = args.attachments && args.attachments.length > 0 ? args.attachments : null;
  return {
    organizationId: args.organizationId,
    userId: args.target.userId ?? null,
    clientId: args.target.clientId ?? null,
    agencyId: args.target.agencyId ?? null,
    title: args.title,
    message: args.message,
    type: args.channel,
    status: args.status,
    eventKind,
    recipient: args.recipient ?? null,
    error: args.error ?? null,
    attachments: (atts ?? undefined) as never,
    sentAt: args.status === 'SENT' ? new Date() : null,
    metadata: {
      ...(args.recipient ? { to: args.recipient } : {}),
      organizationId: args.organizationId,
      ...(args.provider ? { provider: args.provider } : {}),
      ...(args.metadata ?? {}),
    } as never,
  };
}

/**
 * Telecharge les pieces jointes (URL) en Buffer pour les joindre a un email.
 * Best-effort : une piece jointe qui echoue est ignoree (email envoye sans).
 */
async function toEmailAttachments(
  attachments?: NotificationAttachment[],
): Promise<Array<{ filename: string; content: Buffer; contentType?: string }> | undefined> {
  if (!attachments || attachments.length === 0) return undefined;
  const out: Array<{ filename: string; content: Buffer; contentType?: string }> = [];
  for (const att of attachments) {
    try {
      const res = await fetch(att.url);
      if (!res.ok) continue;
      out.push({
        filename: att.filename,
        content: Buffer.from(await res.arrayBuffer()),
        contentType: res.headers.get('content-type') || undefined,
      });
    } catch (err) {
      logger.warn({ err, filename: att.filename }, 'Email attachment fetch failed (ignored)');
    }
  }
  return out.length > 0 ? out : undefined;
}

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
  if (!organizationId) return '';
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { name: true },
  });
  return org?.name || '';
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
  const prefix = tenantName ? `[${tenantName}] ` : '';
  if (channel === 'SMS') {
    // SMS : on garde compact (max ~160 chars sur le body wrapper).
    return { title, message: `${prefix}${body}` };
  }
  // WHATSAPP / PUSH : entete + pied avec branding tenant.
  return {
    title: `${prefix}${title}`,
    message: tenantName ? `${body}\n\n— ${tenantName}` : body,
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
      data: buildNotifRow({
        target,
        organizationId,
        channel: 'IN_APP',
        title: payload.title,
        message: payload.message,
        status: 'SENT',
        attachments: payload.attachments,
        metadata: payload.metadata,
      }),
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

  // Template personnalise du tenant (prioritaire sur le message par defaut).
  // skipTemplate (rejeu depuis le centre de notifications) => message verbatim.
  const eventKind = payload.metadata?.kind as string | undefined;
  const customEmail = payload.skipTemplate
    ? null
    : await resolveTemplate(
        organizationId,
        eventKind,
        'EMAIL',
        payload.templateVariables ?? {},
      ).catch(() => null);

  // Pieces jointes (images colis + facture/recu) telechargees en Buffer.
  const emailAttachments = await toEmailAttachments(payload.attachments);

  try {
    const bodyHtml = customEmail
      ? customEmail.body
      : `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#4B5563">${payload.message}</p>`;
    const subject = customEmail?.subject || payload.title;
    const ok = await emailService.send(
      to,
      subject,
      bodyHtml,
      organizationId,
      { event: eventKind ?? 'NOTIFICATION', attachments: emailAttachments },
    );
    if (!ok) throw new Error('email dispatcher returned false');
    const row = await prisma.notification.create({
      data: buildNotifRow({
        target,
        organizationId,
        channel: 'EMAIL',
        title: payload.title,
        message: payload.message,
        status: 'SENT',
        recipient: to,
        attachments: payload.attachments,
        metadata: payload.metadata,
      }),
    });
    return { channel: 'EMAIL', status: 'SENT', notificationId: row.id };
  } catch (err: any) {
    logger.warn({ err, to }, 'EMAIL delivery failed');
    await prisma.notification
      .create({
        data: buildNotifRow({
          target,
          organizationId,
          channel: 'EMAIL',
          title: payload.title,
          message: payload.message,
          status: 'FAILED',
          recipient: to,
          error: err?.message ?? String(err),
          attachments: payload.attachments,
          metadata: payload.metadata,
        }),
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

  // Template personnalise (SMS/WHATSAPP uniquement — PUSH reste court).
  // skipTemplate (rejeu) => message verbatim, pas de resolution de template.
  let customBody: string | null = null;
  if (channel !== 'PUSH' && !payload.skipTemplate) {
    const eventKind = payload.metadata?.kind as string | undefined;
    if (eventKind) {
      customBody = await resolveTemplate(organizationId, eventKind, channel, payload.templateVariables ?? {})
        .then((t) => t?.body ?? null)
        .catch(() => null);
    }
  }

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
  // Si template personnalise : corps brut (l'admin a ecrit exactement ce qu'il veut).
  const tenantName = await resolveTenantName(organizationId);
  const wrapped = customBody
    ? { title: payload.title, message: customBody }
    : wrapMessage(tenantName, payload.title, payload.message, channel);

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

    // Pieces jointes WhatsApp (best-effort, echec silencieux par fichier).
    if (channel === 'WHATSAPP' && payload.attachments && payload.attachments.length > 0 && provider.sendDocument) {
      for (const att of payload.attachments) {
        for (const r of recipients) {
          try {
            await provider.sendDocument!(r, att.url, att.filename, att.caption);
          } catch (e) {
            logger.warn({ err: e, filename: att.filename, to: r }, 'WhatsApp attachment failed (ignored)');
          }
        }
      }
    }

    const row = await prisma.notification.create({
      data: buildNotifRow({
        target,
        organizationId,
        channel,
        title: wrapped.title,
        message: wrapped.message,
        status: 'SENT',
        recipient: to,
        provider: provider.name,
        attachments: payload.attachments,
        metadata: payload.metadata,
      }),
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
        data: buildNotifRow({
          target,
          organizationId,
          channel,
          title: payload.title,
          message: payload.message,
          status: 'FAILED',
          recipient: to,
          provider: provider.name,
          error: err?.message ?? String(err),
          attachments: payload.attachments,
          metadata: payload.metadata,
        }),
      })
      .catch(() => {});
    return { channel, status: 'FAILED', error: err?.message ?? String(err) };
  }
}

export const deliverSms = (t: NotificationTarget, p: NotificationPayload) =>
  deliverExternal('SMS', smsProvider, t, p);
export const deliverPush = (t: NotificationTarget, p: NotificationPayload) =>
  deliverExternal('PUSH', pushProvider, t, p);

/**
 * Resout le mode d'envoi des pieces jointes WhatsApp pour un tenant.
 * Priorite : config tenant (notificationConfig.waMediaMode) -> override env
 * WA_MEDIA_MODE (compat : 'upload'/'base64' => asset) -> defaut 'asset' (media
 * base64). 'asset' = vrai fichier envoye ; 'link' = lien dans le texte.
 */
async function resolveWaMediaMode(organizationId: string): Promise<WaMediaMode> {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { notificationConfig: true },
    });
    const parsed = notificationChannelConfigSchema.safeParse(org?.notificationConfig ?? {});
    const m = parsed.success ? parsed.data.waMediaMode : undefined;
    if (m === 'asset' || m === 'link') return m;
  } catch {
    // ignore -> fallback env/defaut
  }
  const env = (process.env.WA_MEDIA_MODE ?? '').toLowerCase();
  if (env === 'link') return 'link';
  if (env === 'upload' || env === 'asset' || env === 'base64') return 'asset';
  return 'asset';
}

/**
 * Envoie le corps + les pièces jointes d'une notification via la session
 * WhatsApp Web JS du tenant. Factorisé pour être réutilisé par la livraison
 * directe (deliverWhatsapp) ET par l'écoulement des PENDING (flushPendingWhatsapp).
 *
 * @returns true si le message principal est parti (les PJ suivantes sont best-effort).
 */
async function sendWaBundle(
  svc: import('../whatsapp/TenantWhatsAppSessionService').TenantWhatsAppSessionService,
  organizationId: string,
  phone: string,
  message: string,
  attachments: NotificationAttachment[],
  mediaMode: WaMediaMode,
): Promise<boolean> {
  const images = attachments.filter((a) => a.type === 'image');
  const docs = attachments.filter((a) => a.type !== 'image');

  let sentMain = false;
  if (mediaMode === 'asset' && images.length > 0) {
    // Image principale inline avec la légende = le message.
    sentMain = await svc.sendMedia(organizationId, phone, images[0].url, {
      caption: message,
      filename: images[0].filename,
    });
    for (const img of images.slice(1)) {
      await svc.sendMedia(organizationId, phone, img.url, {
        filename: img.filename,
        caption: img.caption,
      });
    }
  } else {
    const linkLines =
      mediaMode === 'link' && attachments.length > 0
        ? '\n\n' +
          attachments.map((a) => `${a.caption ? `${a.caption} : ` : ''}${a.url}`).join('\n')
        : '';
    sentMain = await svc.sendMessage(organizationId, phone, message + linkLines);
  }

  if (sentMain && mediaMode === 'asset') {
    for (const doc of docs) {
      await svc.sendMedia(organizationId, phone, doc.url, {
        filename: doc.filename,
        caption: doc.caption,
        asDocument: true,
      });
    }
  }
  return sentMain;
}

/**
 * Écoule les notifications WhatsApp restées PENDING pour un tenant : elles ont
 * été créées pendant que la session WhatsApp Web JS se synchronisait (SYNCING).
 * Appelé par le service au 'ready', quand le compte est réellement prêt à
 * envoyer. Traite chaque notif dans l'ordre et la passe SENT / FAILED.
 */
export async function flushPendingWhatsapp(organizationId: string): Promise<void> {
  const { tenantWaSessionService } = await import('../whatsapp/TenantWhatsAppSessionService');
  if (!tenantWaSessionService.isConnected(organizationId)) return;

  const rows = await prisma.notification.findMany({
    where: {
      organizationId,
      type: 'WHATSAPP',
      status: 'PENDING',
      // Uniquement les notifs de la session perso (métadonnée provider).
      metadata: { path: ['provider'], equals: 'whatsapp-web-js' },
    },
    orderBy: { createdAt: 'asc' },
  });
  if (rows.length === 0) return;

  const mediaMode = await resolveWaMediaMode(organizationId);
  logger.info({ organizationId, count: rows.length }, 'WA flush: écoulement des notifs PENDING');

  for (const row of rows) {
    const phone = row.recipient;
    if (!phone) {
      await prisma.notification.update({
        where: { id: row.id },
        data: { status: 'FAILED', error: 'Destinataire WhatsApp manquant.' },
      }).catch(() => {});
      continue;
    }
    const attachments = (row.attachments as NotificationAttachment[] | null) ?? [];
    let sent = false;
    try {
      sent = await sendWaBundle(tenantWaSessionService, organizationId, phone, row.message, attachments, mediaMode);
    } catch (err) {
      logger.warn({ err, organizationId, phone }, 'WA flush send threw');
    }
    await prisma.notification.update({
      where: { id: row.id },
      data: sent
        ? { status: 'SENT', sentAt: new Date() }
        : { status: 'FAILED', error: 'Envoi WhatsApp échoué (après synchronisation).' },
    }).catch(() => {});
  }
}

/**
 * Livraison WhatsApp : essaie d'abord la session WhatsApp Web JS du tenant.
 * - CONNECTED : envoi immédiat.
 * - CONNECTING / SYNCING (session en cours de chargement) : la notif est créée
 *   en PENDING et laissée telle quelle ; elle partira au 'ready' via
 *   flushPendingWhatsapp.
 * - sinon : retombe sur le provider chain configuré (Twilio/Meta).
 */
export async function deliverWhatsapp(
  t: NotificationTarget,
  p: NotificationPayload,
): Promise<ChannelDeliveryResult> {
  const organizationId = await resolveOrganizationId(t);

  // Template personnalise du tenant (resolu une fois pour les deux chemins).
  // skipTemplate (rejeu) => message verbatim.
  const eventKind = p.metadata?.kind as string | undefined;
  const customWa = eventKind && !p.skipTemplate
    ? await resolveTemplate(organizationId, eventKind, 'WHATSAPP', p.templateVariables ?? {}).catch(() => null)
    : null;

  // Tenter le canal WA Web JS du tenant en priorité
  if (organizationId) {
    try {
      const { tenantWaSessionService } = await import('../whatsapp/TenantWhatsAppSessionService');
      // On emprunte le canal perso si la session est CONNECTED (envoi direct)
      // ou en cours de chargement CONNECTING/SYNCING (on met en PENDING). Sinon
      // (QR non scanné, déconnecté...) on laisse tomber sur le provider chain.
      const booting = tenantWaSessionService.isBooting(organizationId);
      const state = await tenantWaSessionService.getStatus(organizationId);
      if (state.status === 'CONNECTED' || booting) {
        // Résoudre le numéro du destinataire
        let phone = t.phone ?? null;
        if (!phone && t.clientId) {
          const c = await prisma.client.findUnique({ where: { id: t.clientId }, select: { phone: true } });
          phone = c?.phone ?? null;
        }
        if (!phone && t.userId) {
          const u = await prisma.user.findUnique({ where: { id: t.userId }, select: { phone: true } });
          phone = u?.phone ?? null;
        }
        if (phone) {
          const tenantName = await resolveTenantName(organizationId);
          // Template personnalise : corps brut. Defaut : wrapMessage avec branding.
          const msgToSend = customWa
            ? customWa.body
            : wrapMessage(tenantName, p.title, p.message, 'WHATSAPP').message;
          const titleToSend = customWa ? p.title : `[${tenantName}] ${p.title}`;

          const attachments = p.attachments ?? [];

          // Cree la notif en PENDING AVANT l'envoi : elle apparait tout de suite
          // dans le centre de notif. On la passe ensuite a SENT ou FAILED.
          const row = await prisma.notification.create({
            data: buildNotifRow({
              target: t,
              organizationId,
              channel: 'WHATSAPP',
              title: titleToSend,
              message: msgToSend,
              status: 'PENDING',
              recipient: phone,
              provider: 'whatsapp-web-js',
              attachments: p.attachments,
              metadata: p.metadata,
            }),
          });

          // Session encore en cours de chargement : on garde la notif PENDING.
          // Elle sera écoulée par flushPendingWhatsapp quand la session sera
          // réellement prête ('ready'). On ne tente pas d'envoi ni de fallback.
          if (state.status !== 'CONNECTED') {
            logger.info(
              { organizationId, phone, waStatus: state.status, loadingPercent: state.loadingPercent },
              'WA perso en synchronisation -> notif PENDING (partira au ready)',
            );
            return { channel: 'WHATSAPP', status: 'PENDING', notificationId: row.id };
          }

          // Mode media WhatsApp Web JS (configurable par tenant) : 'asset'
          // (fichiers en base64) ou 'link' (URLs dans le texte).
          const mediaMode = await resolveWaMediaMode(organizationId);
          let sentMain = false;
          try {
            sentMain = await sendWaBundle(tenantWaSessionService, organizationId, phone, msgToSend, attachments, mediaMode);
          } catch (err) {
            sentMain = false;
            logger.warn({ err, organizationId, phone }, 'WA personal send threw');
          }

          if (sentMain) {
            await prisma.notification.update({
              where: { id: row.id },
              data: { status: 'SENT', sentAt: new Date() },
            });
            logChannelDelivery({ status: 'OK', channel: 'WHATSAPP', title: p.title, target: phone, organizationId, event: eventKind });
            return { channel: 'WHATSAPP', status: 'SENT', notificationId: row.id };
          }

          // Echec (session figee / rate limit abandonne) : on MARQUE la notif
          // FAILED (visible dans le centre) au lieu de la laisser PENDING ou de
          // tomber en silence sur le provider chain.
          const failMsg = 'Envoi WhatsApp echoue (session indisponible ou limite de debit depassee).';
          await prisma.notification.update({
            where: { id: row.id },
            data: { status: 'FAILED', error: failMsg },
          });
          logChannelDelivery({ status: 'FAIL', channel: 'WHATSAPP', title: p.title, target: phone, organizationId, event: eventKind, error: failMsg });
          return { channel: 'WHATSAPP', status: 'FAILED', notificationId: row.id, error: failMsg };
        }
      }
    } catch (err) {
      // Erreur inattendue cote session perso -> on retombe sur le provider chain.
      logger.warn({ err, organizationId }, 'WA personal path error -> fallback chain');
    }
  }

  // deliverExternal fait sa propre resolution de template (second chemin)
  return deliverExternal('WHATSAPP', whatsappProvider, t, p);
}
