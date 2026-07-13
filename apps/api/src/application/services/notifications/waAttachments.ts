import { config } from '../../../config';
import { minioClient } from '../../../config/minio';
import { createChildLogger } from '../../../config/logger';
import type { NotificationAttachment } from './types';

const logger = createChildLogger('WaAttachments');

/**
 * Helpers d'envoi des pièces jointes WhatsApp (canal personnel / API interne).
 * Extraits de channels.ts pour garder ce dernier sous la limite de taille.
 */

/** Devine le MIME d'une pièce jointe depuis son extension (document vs image). */
export function mimeFromFilename(name: string): string {
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
export async function sendWaAttachments(
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
