import { prisma } from '../../../config/database';
import { createChildLogger } from '../../../config/logger';
import { config } from '../../../config';

const logger = createChildLogger('TenantWhatsAppSessionService');

/**
 * Canal WhatsApp personnel d'un tenant, adossé à l'API WhatsApp interne
 * (whatsapp-api.transitsoftservices.com, moteur Baileys, multi-sessions).
 *
 * Le QR / la connexion se gèrent sur le dashboard externe
 * (whatsapp-dashboard.transitsoftservices.com), qui délivre une CLÉ API scopée
 * à la session. Ici on ne fait que **configurer les variables du client**
 * (clé API par tenant + base URL optionnelle) et envoyer des messages texte.
 *
 * Remplace l'ancien moteur whatsapp-web.js (puppeteer/QR local) : plus de
 * session locale, de rate limiter, ni de cycle SYNCING/PENDING — l'API externe
 * gère la file d'attente, le rate limit par session et la disponibilité.
 */

const REQUEST_TIMEOUT_MS = 15_000;

export interface WaSessionState {
  /** Canal activé pour le tenant. */
  enabled: boolean;
  /** Une clé API est enregistrée. */
  configured: boolean;
  /** Base URL effective (override tenant sinon globale), null si aucune. */
  baseUrl: string | null;
  /**
   * Statut : soit celui renvoyé par l'API externe (`connected`, `qr`,
   * `connecting`, `disconnected`, `logged_out`...), soit un statut local :
   * `NOT_CONFIGURED` (pas de clé), `NO_BASE_URL`, `UNREACHABLE`.
   */
  status: string;
  connectedPhone: string | null;
  lastError: string | null;
  lastCheckedAt: string | null;
}

interface WaApiSession {
  id: string;
  name: string;
  phoneNumber: string | null;
  status: string;
  rateLimitPerMin: number;
}

/** Base URL effective : override tenant, sinon config globale. Null si aucune. */
function resolveBaseUrl(baseUrl?: string | null): string | null {
  const url = (baseUrl && baseUrl.trim()) || config.whatsapp.apiUrl;
  return url ? url.replace(/\/+$/, '') : null;
}

/** L'API externe attend un numéro sans `+` (digits only). */
function normalizePhone(phone: string): string {
  return phone.replace(/[^\d]/g, '');
}

async function waFetch<T>(
  baseUrl: string,
  apiKey: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${baseUrl}/v1${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg = typeof data.error === 'string' ? data.error : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data as T;
}

export class TenantWhatsAppSessionService {
  /** Config brute du tenant, ou null si jamais configurée. */
  private async loadRow(organizationId: string) {
    return prisma.tenantWhatsAppSession.findUnique({ where: { organizationId } });
  }

  /**
   * Enregistre les variables de connexion du tenant.
   * - `apiKey` : `undefined` => inchangé ; chaîne vide => efface.
   * - `baseUrl` : `undefined` => inchangé ; chaîne vide => remet la globale.
   */
  async saveConfig(
    organizationId: string,
    input: { enabled?: boolean; apiKey?: string; baseUrl?: string },
  ): Promise<WaSessionState> {
    const data: Record<string, unknown> = {};
    if (input.enabled !== undefined) data.enabled = input.enabled;
    if (input.apiKey !== undefined) data.apiKey = input.apiKey.trim() || null;
    if (input.baseUrl !== undefined) data.baseUrl = input.baseUrl.trim() || null;

    await prisma.tenantWhatsAppSession.upsert({
      where: { organizationId },
      create: {
        organizationId,
        enabled: input.enabled ?? false,
        apiKey: input.apiKey?.trim() || null,
        baseUrl: input.baseUrl?.trim() || null,
      },
      update: data,
    });

    logger.info({ organizationId, enabled: input.enabled }, 'Config WhatsApp tenant mise à jour');
    return this.getStatus(organizationId);
  }

  /** Désactive le canal et efface la clé API du tenant. */
  async clearConfig(organizationId: string): Promise<void> {
    await prisma.tenantWhatsAppSession
      .updateMany({
        where: { organizationId },
        data: { enabled: false, apiKey: null, connectedPhone: null, lastStatus: null, lastError: null },
      })
      .catch(() => {});
    logger.info({ organizationId }, 'Config WhatsApp tenant effacée');
  }

  /**
   * État courant : lit la config puis, si une clé est présente, interroge
   * l'API externe (GET /v1/session) pour rafraîchir statut + numéro connecté.
   */
  async getStatus(organizationId: string): Promise<WaSessionState> {
    const row = await this.loadRow(organizationId);
    const baseUrl = resolveBaseUrl(row?.baseUrl);

    if (!row || !row.apiKey) {
      return {
        enabled: row?.enabled ?? false,
        configured: false,
        baseUrl,
        status: 'NOT_CONFIGURED',
        connectedPhone: null,
        lastError: null,
        lastCheckedAt: row?.lastCheckedAt?.toISOString() ?? null,
      };
    }
    if (!baseUrl) {
      return {
        enabled: row.enabled,
        configured: true,
        baseUrl: null,
        status: 'NO_BASE_URL',
        connectedPhone: row.connectedPhone,
        lastError: 'Aucune base URL (WA_API_URL) configurée.',
        lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null,
      };
    }

    try {
      const session = await waFetch<WaApiSession>(baseUrl, row.apiKey, 'GET', '/session');
      await prisma.tenantWhatsAppSession.update({
        where: { organizationId },
        data: {
          connectedPhone: session.phoneNumber,
          lastStatus: session.status,
          lastError: null,
          lastCheckedAt: new Date(),
        },
      });
      return {
        enabled: row.enabled,
        configured: true,
        baseUrl,
        status: session.status,
        connectedPhone: session.phoneNumber,
        lastError: null,
        lastCheckedAt: new Date().toISOString(),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await prisma.tenantWhatsAppSession
        .update({
          where: { organizationId },
          data: { lastStatus: 'UNREACHABLE', lastError: message, lastCheckedAt: new Date() },
        })
        .catch(() => {});
      logger.warn({ organizationId, err: message }, 'WA getStatus: API injoignable / clé invalide');
      return {
        enabled: row.enabled,
        configured: true,
        baseUrl,
        status: 'UNREACHABLE',
        connectedPhone: row.connectedPhone,
        lastError: message,
        lastCheckedAt: new Date().toISOString(),
      };
    }
  }

  /**
   * Teste une clé/base URL (celles fournies, sinon celles enregistrées) et
   * renvoie la session de l'API externe, ou lève en cas d'échec.
   */
  async testConnection(
    organizationId: string,
    override?: { apiKey?: string; baseUrl?: string },
  ): Promise<WaApiSession> {
    const row = await this.loadRow(organizationId);
    const apiKey = override?.apiKey?.trim() || row?.apiKey || '';
    const baseUrl = resolveBaseUrl(override?.baseUrl ?? row?.baseUrl);
    if (!apiKey) throw new Error('Aucune clé API configurée.');
    if (!baseUrl) throw new Error('Aucune base URL (WA_API_URL) configurée.');
    return waFetch<WaApiSession>(baseUrl, apiKey, 'GET', '/session');
  }

  /**
   * Retourne les identifiants d'envoi si le canal perso est utilisable
   * (activé + clé + base URL), sinon null. Utilisé par la livraison des
   * notifications pour décider d'emprunter ce canal.
   */
  async getSendable(organizationId: string): Promise<{ baseUrl: string; apiKey: string } | null> {
    const row = await this.loadRow(organizationId);
    if (!row || !row.enabled || !row.apiKey) return null;
    const baseUrl = resolveBaseUrl(row.baseUrl);
    if (!baseUrl) return null;
    return { baseUrl, apiKey: row.apiKey };
  }

  /**
   * Envoie un message texte via l'API WhatsApp interne (file d'attente gérée
   * côté serveur). Résout `true` dès acceptation (statut `queued`), `false`
   * sur échec (et journalise la dernière erreur sur le tenant).
   */
  async sendMessage(organizationId: string, phone: string, body: string): Promise<boolean> {
    const sendable = await this.getSendable(organizationId);
    if (!sendable) return false;
    const to = normalizePhone(phone);
    try {
      await waFetch<{ id: string; status: string }>(
        sendable.baseUrl,
        sendable.apiKey,
        'POST',
        '/messages',
        { to, body },
      );
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn({ organizationId, phone: to, err: message }, 'WA sendMessage échoué');
      await prisma.tenantWhatsAppSession
        .updateMany({ where: { organizationId }, data: { lastError: message } })
        .catch(() => {});
      return false;
    }
  }
}

export const tenantWaSessionService = new TenantWhatsAppSessionService();
