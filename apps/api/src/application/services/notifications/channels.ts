import { prisma } from '../../../config/database';
import { config } from '../../../config';
import { minioClient } from '../../../config/minio';
import { emailService } from '../../../infrastructure/email/EmailService';
import { logChannelDelivery } from '../../../infrastructure/email/logging';
import { realtimeService } from '../../../infrastructure/realtime/RealtimeService';
import { createChildLogger } from '../../../config/logger';
import { resolveTemplate } from './NotificationTemplateRenderer';
import { safeFetch } from '../../../infrastructure/http/safeFetch';
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
      const res = await safeFetch(att.url);
      if (!res.ok) continue;
      out.push({
        filename: att.filename,
        content: Buffer.from(await res.arrayBuffer()),
        contentType: res.headers.get('content-type') || undefined,
      });
    } catch (err) {
      logger.warn({ err, filename: att.filename }, 'Email attachment fetch failed or blocked (SSRF) (ignored)');
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

/** Devine le MIME d'une pièce jointe depuis son extension (document vs image). */
function mimeFromFilename(name: string): string {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  switch (ext) {
    case 'pdf':
      return 'application/pdf';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    default:
      return 'application/octet-stream';
  }
}

/** Ligne de secours (texte) quand l'envoi média échoue : caption + lien. */
function attachmentLinkLine(a: NotificationAttachment): string {
  return `${a.caption ? `${a.caption} : ` : ''}${a.url}`;
}

/** Extrait la clé objet MinIO d'une URL presignée path-style (/<bucket>/<key>). */
function storageKeyFromUrl(url: string): string | null {
  try {
    const p = decodeURIComponent(new URL(url).pathname);
    const prefix = `/${config.minio.bucket}/`;
    if (p.startsWith(prefix)) return p.slice(prefix.length);
    return p.replace(/^\//, '') || null;
  } catch {
    return null;
  }
}

/** Télécharge un objet MinIO (endpoint INTERNE, toujours joignable) en base64. */
async function downloadObjectBase64(key: string): Promise<string | null> {
  try {
    const stream = await minioClient.getObject(config.minio.bucket, key);
    const chunks: Buffer[] = [];
    for await (const c of stream as AsyncIterable<Buffer>) chunks.push(c as Buffer);
    return Buffer.concat(chunks).toString('base64');
  } catch (err) {
    logger.warn({ err, key }, 'WA attachment MinIO download failed (ignored)');
    return null;
  }
}

/**
 * Envoie les pièces jointes en vrais médias (documents/images) via l'API
 * WhatsApp interne. **Hybride** : on privilégie l'envoi INLINE (base64, octets
 * lus depuis le MinIO interne) qui marche même si le MinIO du tenant n'est PAS
 * exposé sur internet ; sinon on retombe sur l'URL presignée (Baileys fetch,
 * requiert un MinIO public) ; en dernier recours un message texte avec le lien.
 * Best-effort par fichier.
 */
async function sendWaAttachments(
  organizationId: string,
  phone: string,
  attachments: NotificationAttachment[],
): Promise<void> {
  const { tenantWaSessionService } = await import('../whatsapp/TenantWhatsAppSessionService');
  for (const att of attachments) {
    const mimetype = mimeFromFilename(att.filename);

    // 1. Inline base64 depuis le MinIO interne (universel, pas besoin de public).
    const key = storageKeyFromUrl(att.url);
    const b64 = key ? await downloadObjectBase64(key) : null;
    let ok = b64
      ? await tenantWaSessionService.sendDocument(
          organizationId, phone, { mediaBase64: b64 }, att.filename, att.caption, mimetype,
        )
      : false;

    // 2. Fallback URL (tenants avec MinIO public : Baileys telecharge l'URL).
    if (!ok) {
      ok = await tenantWaSessionService.sendDocument(
        organizationId, phone, { mediaUrl: att.url }, att.filename, att.caption, mimetype,
      );
    }

    // 3. Dernier recours : lien texte (au moins récupérable si MinIO public).
    if (!ok) {
      await tenantWaSessionService
        .sendMessage(organizationId, phone, attachmentLinkLine(att))
        .catch(() => {});
    }
  }
}

/**
 * Livraison WhatsApp : emprunte d'abord le canal WhatsApp personnel du tenant
 * (API WhatsApp interne) s'il est configuré + activé, sinon retombe sur le
 * provider chain configuré (Twilio / Meta / Africa's Talking).
 *
 * L'API interne gère la file d'attente et le rate limit par session : on file
 * le message (texte + liens des pièces jointes) et on marque la notif SENT dès
 * acceptation, FAILED sinon.
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

  // Tenter le canal WhatsApp personnel (API interne) en priorité.
  if (organizationId) {
    try {
      const { tenantWaSessionService } = await import('../whatsapp/TenantWhatsAppSessionService');
      // Canal utilisable seulement si le tenant a activé + renseigné sa clé API.
      const sendable = await tenantWaSessionService.getSendable(organizationId);
      if (sendable) {
        // Résoudre le numéro du destinataire.
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
          const bodyBase = customWa
            ? customWa.body
            : wrapMessage(tenantName, p.title, p.message, 'WHATSAPP').message;
          const titleToSend = customWa ? p.title : `[${tenantName}] ${p.title}`;
          // Le texte part seul ; les pièces jointes suivent en vrais médias
          // (documents/images) — plus de liens collés dans le corps.
          const msgToSend = bodyBase;

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
              provider: 'whatsapp-api',
              attachments: p.attachments,
              metadata: p.metadata,
            }),
          });

          let sent = false;
          try {
            sent = await tenantWaSessionService.sendMessage(organizationId, phone, msgToSend);
          } catch (err) {
            logger.warn({ err, organizationId, phone }, 'WA personal send threw');
          }

          if (sent) {
            // Pièces jointes en médias réels (best-effort, fallback lien si échec).
            if (p.attachments && p.attachments.length > 0) {
              await sendWaAttachments(organizationId, phone, p.attachments).catch((err) =>
                logger.warn({ err, organizationId, phone }, 'WA attachments send failed (ignored)'),
              );
            }
            await prisma.notification.update({
              where: { id: row.id },
              data: { status: 'SENT', sentAt: new Date() },
            });
            logChannelDelivery({ status: 'OK', channel: 'WHATSAPP', title: p.title, target: phone, organizationId, event: eventKind });
            return { channel: 'WHATSAPP', status: 'SENT', notificationId: row.id };
          }

          // Echec (API injoignable / clé invalide) : on MARQUE la notif FAILED
          // (visible dans le centre) plutôt que de tomber en silence.
          const failMsg = 'Envoi WhatsApp échoué (API WhatsApp indisponible ou clé invalide).';
          await prisma.notification.update({
            where: { id: row.id },
            data: { status: 'FAILED', error: failMsg },
          });
          logChannelDelivery({ status: 'FAIL', channel: 'WHATSAPP', title: p.title, target: phone, organizationId, event: eventKind, error: failMsg });
          return { channel: 'WHATSAPP', status: 'FAILED', notificationId: row.id, error: failMsg };
        }
      }
    } catch (err) {
      // Erreur inattendue cote canal perso -> on retombe sur le provider chain.
      logger.warn({ err, organizationId }, 'WA personal path error -> fallback chain');
    }
  }

  // deliverExternal fait sa propre resolution de template (second chemin)
  return deliverExternal('WHATSAPP', whatsappProvider, t, p);
}
