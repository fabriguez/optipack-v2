import { container } from '../../container';
import { prisma } from '../../config/database';
import { StorageService } from '../../infrastructure/storage/StorageService';
import { safeFetch } from '../../infrastructure/http/safeFetch';
import { createChildLogger } from '../../config/logger';
import type { PDFBranding } from './PDFService';

const logger = createChildLogger('PdfBranding');

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const ch of stream as AsyncIterable<Buffer>) chunks.push(ch);
  return Buffer.concat(chunks);
}

/**
 * Telecharge le logo d'un tenant en Buffer pour l'embarquer dans un PDF.
 * Gere TOUTES les formes que peut prendre org.logoUrl :
 *  - data URL base64 (logo pousse depuis l'ops-admin historique)
 *  - cle/URL MinIO publique  : .../uploads/public/<rest>   -> cle public/<rest>
 *  - cle/URL MinIO privee    : .../uploads/object/<key>     -> cle <key>
 *  - cle relative directe (uploads/... ou public/...)
 *  - URL externe absolue (CDN / proxy public-logo)          -> fetch direct
 * Retourne null si indisponible (le PDF s'affiche alors sans logo).
 */
export async function fetchLogoBuffer(logoUrl: string | null | undefined): Promise<Buffer | null> {
  if (!logoUrl) return null;

  // 1. Data URL base64.
  const dataMatch = /^data:([^;,]+)?(;base64)?,(.*)$/is.exec(logoUrl);
  if (dataMatch) {
    try {
      const isBase64 = Boolean(dataMatch[2]);
      const payload = dataMatch[3] ?? '';
      return isBase64
        ? Buffer.from(payload, 'base64')
        : Buffer.from(decodeURIComponent(payload), 'utf-8');
    } catch {
      return null;
    }
  }

  // 2. Nos propres objets MinIO : on extrait la cle et on stream depuis le bucket.
  const decode = (s: string) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  };
  let key: string | null = null;
  const pubMarker = '/uploads/public/';
  const objMarker = '/uploads/object/';
  const pubIdx = logoUrl.indexOf(pubMarker);
  const objIdx = logoUrl.indexOf(objMarker);
  if (pubIdx !== -1) {
    key = `${StorageService.PUBLIC_PREFIX}${decode(logoUrl.slice(pubIdx + pubMarker.length))}`;
  } else if (objIdx !== -1) {
    key = decode(logoUrl.slice(objIdx + objMarker.length));
  } else if (!/^https?:\/\//i.test(logoUrl)) {
    key = decode(logoUrl); // cle relative deja stockee
  }
  if (key) {
    try {
      const storage = container.resolve(StorageService);
      const obj = await storage.getObject(key);
      if (obj) return streamToBuffer(obj.stream);
    } catch (err) {
      logger.warn({ err, key }, 'fetchLogoBuffer: lecture MinIO echouee');
    }
  }

  // 3. URL externe absolue (ou proxy public-logo) : fetch direct.
  if (/^https?:\/\//i.test(logoUrl)) {
    try {
      const res = await safeFetch(logoUrl);
      if (res.ok) return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      logger.warn({ err, logoUrl }, 'fetchLogoBuffer: fetch externe echoue (ou URL bloquee SSRF)');
    }
  }
  return null;
}

/**
 * Charge le branding PDF complet d'un tenant (nom, contacts, couleur, logo
 * embarque) pour habiller les imprimables : factures, recus, tickets/etiquettes,
 * manifestes, etc. Retourne null si l'org est introuvable.
 */
export async function loadPdfBranding(
  organizationId: string | null | undefined,
): Promise<PDFBranding | null> {
  if (!organizationId) return null;
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      name: true,
      phone: true,
      email: true,
      address: true,
      logoUrl: true,
      primaryColor: true,
    },
  });
  if (!org) return null;
  const logoBuffer = await fetchLogoBuffer(org.logoUrl);
  return {
    organizationName: org.name,
    organizationPhone: org.phone,
    organizationEmail: org.email,
    organizationAddress: org.address,
    primaryColor: org.primaryColor,
    logoBuffer,
  };
}
