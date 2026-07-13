import { prisma } from '../../../config/database';
import { createChildLogger } from '../../../config/logger';

const logger = createChildLogger('WapinoService');

/**
 * Wapino (https://wapino.consolidis.com) — provider WhatsApp hébergé, utilisé
 * en FALLBACK du canal WhatsApp personnel du tenant. Les deux canaux sont
 * indépendants et peuvent être configurés/connectés simultanément : la
 * livraison tente le canal perso d'abord, Wapino ensuite.
 *
 * Contrat API (doc https://wapino.consolidis.com/docs) :
 *   Base        : https://api.wapino.consolidis.com/v1
 *   Auth        : Authorization: Bearer wp_live_...
 *   Texte       : POST /messages/send-text   { instance, number, text }
 *   Média       : POST /messages/send-media  { instance, number, mediaUrl,
 *                   type: 'image'|'document', caption?, fileName? }
 *   Legacy      : POST /message/send         { number, text }  (comptes
 *                   mono-instance, sans champ instance)
 *   `number`    : chiffres uniquement, indicatif pays inclus (2376xxxxxxx).
 *
 * NB : send-media télécharge `mediaUrl` côté Wapino — l'URL doit être
 * publique (MinIO presign public, cf. MINIO_PUBLIC_BASE_URL).
 */

const DEFAULT_BASE_URL = 'https://api.wapino.consolidis.com/v1';
const REQUEST_TIMEOUT_MS = 15_000;

export interface WapinoState {
  enabled: boolean;
  configured: boolean;
  instance: string | null;
  baseUrl: string;
  lastError: string | null;
  lastOkAt: string | null;
}

interface WapinoCreds {
  apiKey: string;
  instance: string | null;
  baseUrl: string;
}

function resolveBaseUrl(baseUrl?: string | null): string {
  const url = (baseUrl && baseUrl.trim()) || process.env.WAPINO_BASE_URL || DEFAULT_BASE_URL;
  return url.replace(/\/+$/, '');
}

function digits(phone: string): string {
  return phone.replace(/[^\d]/g, '');
}

async function wapinoFetch(
  creds: WapinoCreds,
  path: string,
  body: Record<string, unknown>,
): Promise<void> {
  const res = await fetch(`${creds.baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${creds.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const msg =
      typeof data.error === 'string' ? data.error
      : typeof data.message === 'string' ? data.message
      : `HTTP ${res.status}`;
    throw new Error(`Wapino: ${msg}`);
  }
}

/** Envoi texte : send-text (avec instance) ou legacy /message/send (sans). */
async function sendTextRaw(creds: WapinoCreds, phone: string, text: string): Promise<void> {
  const number = digits(phone);
  if (creds.instance) {
    await wapinoFetch(creds, '/messages/send-text', { instance: creds.instance, number, text });
  } else {
    await wapinoFetch(creds, '/message/send', { number, text });
  }
}

export class WapinoService {
  private async loadRow(organizationId: string) {
    return prisma.tenantWapinoConfig.findUnique({ where: { organizationId } });
  }

  /**
   * Enregistre la config Wapino du tenant.
   * - `apiKey` / `instance` / `baseUrl` : `undefined` => inchangé ; chaîne vide => efface.
   */
  async saveConfig(
    organizationId: string,
    input: { enabled?: boolean; apiKey?: string; instance?: string; baseUrl?: string },
  ): Promise<WapinoState> {
    const data: Record<string, unknown> = {};
    if (input.enabled !== undefined) data.enabled = input.enabled;
    if (input.apiKey !== undefined) data.apiKey = input.apiKey.trim() || null;
    if (input.instance !== undefined) data.instance = input.instance.trim() || null;
    if (input.baseUrl !== undefined) data.baseUrl = input.baseUrl.trim() || null;

    await prisma.tenantWapinoConfig.upsert({
      where: { organizationId },
      create: {
        organizationId,
        enabled: input.enabled ?? false,
        apiKey: input.apiKey?.trim() || null,
        instance: input.instance?.trim() || null,
        baseUrl: input.baseUrl?.trim() || null,
      },
      update: data,
    });
    logger.info({ organizationId, enabled: input.enabled }, 'Config Wapino tenant mise à jour');
    return this.getStatus(organizationId);
  }

  /** Désactive et efface la clé API Wapino du tenant. */
  async clearConfig(organizationId: string): Promise<void> {
    await prisma.tenantWapinoConfig
      .updateMany({
        where: { organizationId },
        data: { enabled: false, apiKey: null, lastError: null },
      })
      .catch(() => {});
    logger.info({ organizationId }, 'Config Wapino tenant effacée');
  }

  /**
   * État courant. L'API Wapino n'expose pas de statut de session à la clé API
   * (la gestion d'instances passe par le JWT du compte) : le statut se limite
   * à configured/enabled + dernier envoi OK / dernière erreur.
   */
  async getStatus(organizationId: string): Promise<WapinoState> {
    const row = await this.loadRow(organizationId);
    return {
      enabled: row?.enabled ?? false,
      configured: !!row?.apiKey,
      instance: row?.instance ?? null,
      baseUrl: resolveBaseUrl(row?.baseUrl),
      lastError: row?.lastError ?? null,
      lastOkAt: row?.lastOkAt?.toISOString() ?? null,
    };
  }

  /**
   * Teste la config en envoyant un vrai message texte au numéro fourni
   * (Wapino n'a pas d'endpoint de statut côté clé API). Lève en cas d'échec.
   */
  async testConnection(
    organizationId: string,
    input: { phone: string; apiKey?: string; instance?: string; baseUrl?: string },
  ): Promise<void> {
    const row = await this.loadRow(organizationId);
    const apiKey = input.apiKey?.trim() || row?.apiKey || '';
    if (!apiKey) throw new Error('Aucune clé API Wapino configurée.');
    const creds: WapinoCreds = {
      apiKey,
      instance: input.instance?.trim() || row?.instance || null,
      baseUrl: resolveBaseUrl(input.baseUrl ?? row?.baseUrl),
    };
    try {
      await sendTextRaw(creds, input.phone, 'Test de connexion Wapino — message envoyé depuis votre plateforme.');
      await prisma.tenantWapinoConfig
        .updateMany({ where: { organizationId }, data: { lastError: null, lastOkAt: new Date() } })
        .catch(() => {});
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await prisma.tenantWapinoConfig
        .updateMany({ where: { organizationId }, data: { lastError: message } })
        .catch(() => {});
      throw err;
    }
  }

  /** Creds d'envoi si le fallback Wapino est utilisable (activé + clé), sinon null. */
  async getSendable(organizationId: string): Promise<WapinoCreds | null> {
    const row = await this.loadRow(organizationId);
    if (!row || !row.enabled || !row.apiKey) return null;
    return { apiKey: row.apiKey, instance: row.instance, baseUrl: resolveBaseUrl(row.baseUrl) };
  }

  /** Envoie un texte. `true` si accepté, `false` sinon (erreur journalisée). */
  async sendMessage(organizationId: string, phone: string, text: string): Promise<boolean> {
    const creds = await this.getSendable(organizationId);
    if (!creds) return false;
    try {
      await sendTextRaw(creds, phone, text);
      await prisma.tenantWapinoConfig
        .updateMany({ where: { organizationId }, data: { lastError: null, lastOkAt: new Date() } })
        .catch(() => {});
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn({ organizationId, err: message }, 'Wapino sendMessage échoué');
      await prisma.tenantWapinoConfig
        .updateMany({ where: { organizationId }, data: { lastError: message } })
        .catch(() => {});
      return false;
    }
  }

  /**
   * Envoie un document/image par URL publique (Wapino télécharge l'URL ;
   * pas d'envoi inline base64 côté Wapino). `true` si accepté.
   */
  async sendDocument(
    organizationId: string,
    phone: string,
    mediaUrl: string,
    fileName: string,
    caption?: string,
    mimetype = 'application/pdf',
  ): Promise<boolean> {
    const creds = await this.getSendable(organizationId);
    if (!creds || !creds.instance) return false; // send-media requiert une instance
    try {
      await wapinoFetch(creds, '/messages/send-media', {
        instance: creds.instance,
        number: digits(phone),
        mediaUrl,
        type: mimetype.startsWith('image/') ? 'image' : 'document',
        fileName,
        caption: caption || undefined,
      });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn({ organizationId, fileName, err: message }, 'Wapino sendDocument échoué');
      await prisma.tenantWapinoConfig
        .updateMany({ where: { organizationId }, data: { lastError: message } })
        .catch(() => {});
      return false;
    }
  }
}

export const wapinoService = new WapinoService();
