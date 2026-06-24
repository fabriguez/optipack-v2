import path from 'path';
import { EventEmitter } from 'events';
import { prisma } from '../../../config/database';
import { createChildLogger } from '../../../config/logger';
import { emailService } from '../../../infrastructure/email/EmailService';

const logger = createChildLogger('TenantWhatsAppSessionService');

/**
 * Token bucket simplifié pour rate limiting WhatsApp.
 * Chaque envoi consomme 1 token. Les tokens se rechargent progressivement.
 */
class RateLimiter {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private perHour: number,
    private minDelayMs: number,
    private lastSentAt: number = 0,
  ) {
    this.tokens = perHour;
    this.lastRefill = Date.now();
  }

  canSend(): { ok: boolean; waitMs?: number } {
    this.refill();
    const now = Date.now();
    const sinceLastSend = now - this.lastSentAt;
    if (sinceLastSend < this.minDelayMs) {
      return { ok: false, waitMs: this.minDelayMs - sinceLastSend };
    }
    if (this.tokens < 1) {
      const msPerToken = 3_600_000 / this.perHour;
      return { ok: false, waitMs: Math.ceil(msPerToken - ((now - this.lastRefill) % msPerToken)) };
    }
    return { ok: true };
  }

  consume(): void {
    this.tokens = Math.max(0, this.tokens - 1);
    this.lastSentAt = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = (elapsed / 3_600_000) * this.perHour;
    if (tokensToAdd >= 1) {
      this.tokens = Math.min(this.perHour, this.tokens + Math.floor(tokensToAdd));
      this.lastRefill = now;
    }
  }

  update(perHour: number, minDelayMs: number): void {
    this.perHour = perHour;
    this.minDelayMs = minDelayMs;
    this.tokens = Math.min(this.tokens, perHour);
  }
}

export type WaSessionStatus = 'DISCONNECTED' | 'QR_READY' | 'CONNECTING' | 'CONNECTED' | 'BANNED';

export interface WaSessionState {
  status: WaSessionStatus;
  qrCode: string | null;
  connectedPhone: string | null;
  lastError: string | null;
}

/**
 * Gère les sessions WhatsApp Web JS par tenant.
 * Chaque tenant a son propre dossier d'auth (.wwebjs_auth/<orgId>/)
 * et son propre rate limiter.
 *
 * Singleton : instancié une fois au démarrage, accès via getInstance().
 */
export class TenantWhatsAppSessionService extends EventEmitter {
  private static instance: TenantWhatsAppSessionService;

  private clients = new Map<string, import('whatsapp-web.js').Client>();
  private limiters = new Map<string, RateLimiter>();
  private authDir: string;

  private constructor() {
    super();
    this.authDir = process.env.WWEBJS_AUTH_DIR ?? path.join(process.cwd(), '.wwebjs_auth');
  }

  static getInstance(): TenantWhatsAppSessionService {
    if (!TenantWhatsAppSessionService.instance) {
      TenantWhatsAppSessionService.instance = new TenantWhatsAppSessionService();
    }
    return TenantWhatsAppSessionService.instance;
  }

  /**
   * Démarre ou reprend une session WhatsApp pour le tenant.
   * Émet 'qr' et 'ready' sur l'EventEmitter (+ stocke en DB).
   */
  async startSession(organizationId: string): Promise<void> {
    if (this.clients.has(organizationId)) {
      logger.info({ organizationId }, 'Session already running');
      return;
    }

    await this.updateDbStatus(organizationId, 'CONNECTING', null, null, null);

    // Import dynamique pour éviter crash si puppeteer non dispo en dev
    const { Client, LocalAuth } = await import('whatsapp-web.js');

    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: organizationId,
        dataPath: this.authDir,
      }),
      puppeteer: {
        headless: true,
        // protocolTimeout : delai max d'une commande CDP (Runtime.callFunctionOn).
        // Le defaut puppeteer (180s) etait depasse sous charge / page WA lente
        // sur container a faible RAM -> ProtocolError "callFunctionOn timed out".
        // On le rend explicite + configurable.
        protocolTimeout: Number(process.env.WA_PROTOCOL_TIMEOUT_MS ?? 180000),
        // En production Alpine Docker, Chromium est installee via apk et
        // PUPPETEER_EXECUTABLE_PATH pointe vers /usr/bin/chromium-browser.
        ...(process.env.PUPPETEER_EXECUTABLE_PATH
          ? { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH }
          : {}),
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          // Stabilite headless en container contraint : reduit le throttling
          // des timers/onglets en arriere-plan (WA Web JS evalue en continu).
          '--disable-extensions',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--no-first-run',
        ],
      },
    });

    this.clients.set(organizationId, client);

    client.on('qr', async (qr: string) => {
      try {
        const QRCode = await import('qrcode');
        const qrDataUrl = await QRCode.toDataURL(qr);
        await this.updateDbStatus(organizationId, 'QR_READY', qrDataUrl, null, null);
        this.emit(`qr:${organizationId}`, qrDataUrl);
        logger.info({ organizationId }, 'QR code generated');
      } catch (err) {
        logger.warn({ err, organizationId }, 'QR generation failed');
      }
    });

    client.on('ready', async () => {
      try {
        const info = client.info;
        const phone = info?.wid?.user ? `+${info.wid.user}` : null;
        await this.updateDbStatus(organizationId, 'CONNECTED', null, phone, null);
        this.emit(`ready:${organizationId}`, phone);
        logger.info({ organizationId, phone }, 'WhatsApp session connected');
      } catch (err) {
        logger.warn({ err }, 'Error on ready event');
      }
    });

    client.on('disconnected', async (reason: string) => {
      this.clients.delete(organizationId);
      const isBanned = reason === 'BANNED';
      await this.updateDbStatus(
        organizationId,
        isBanned ? 'BANNED' : 'DISCONNECTED',
        null,
        null,
        isBanned ? 'Compte WhatsApp banni.' : reason,
      );
      this.emit(`disconnected:${organizationId}`, reason);
      if (isBanned) await this.notifyBan(organizationId);
      logger.warn({ organizationId, reason }, 'WhatsApp session disconnected');
    });

    client.on('auth_failure', async (msg: string) => {
      this.clients.delete(organizationId);
      await this.updateDbStatus(organizationId, 'DISCONNECTED', null, null, `Auth failure: ${msg}`);
      this.emit(`disconnected:${organizationId}`, msg);
    });

    await client.initialize();
  }

  /**
   * Déconnecte et détruit la session du tenant.
   */
  async destroySession(organizationId: string): Promise<void> {
    const client = this.clients.get(organizationId);
    if (client) {
      try {
        await client.logout();
        await client.destroy();
      } catch (err) {
        logger.warn({ err, organizationId }, 'Error during logout');
      }
      this.clients.delete(organizationId);
    }
    this.limiters.delete(organizationId);
    await this.updateDbStatus(organizationId, 'DISCONNECTED', null, null, null);
    logger.info({ organizationId }, 'Session destroyed');
  }

  /**
   * Envoie un message WhatsApp depuis la session du tenant.
   * Applique le rate limit configuré. Notifie par email en cas d'échec.
   *
   * @returns true si envoyé, false si rate limité ou session inactive.
   */
  async sendMessage(
    organizationId: string,
    phone: string,
    message: string,
  ): Promise<boolean> {
    const client = this.clients.get(organizationId);
    if (!client) return false;

    const session = await prisma.tenantWhatsAppSession.findUnique({
      where: { organizationId },
    });
    if (!session || session.status !== 'CONNECTED') return false;

    const limiter = this.getOrCreateLimiter(
      organizationId,
      session.rateLimitPerHour,
      session.minDelaySeconds * 1000,
    );

    const check = limiter.canSend();
    if (!check.ok) {
      logger.warn({ organizationId, waitMs: check.waitMs }, 'WA rate limit hit');
      return false;
    }

    try {
      const chatId = phone.replace(/[^0-9]/g, '') + '@c.us';
      await this.withSendTimeout(() => client.sendMessage(chatId, message));
      limiter.consume();
      return true;
    } catch (err) {
      logger.error({ err, organizationId, phone }, 'WA sendMessage failed');
      await this.notifyFailure(organizationId, phone, String(err));
      return false;
    }
  }

  /**
   * Borne la duree d'un envoi WhatsApp. Le canal WA Web JS (puppeteer) peut se
   * figer (page lente, RAM container) et faire trainer un envoi jusqu'au
   * protocolTimeout (180s), bloquant le Promise.all de NotificationService.
   * On echoue vite (defaut 60s) -> deliverWhatsapp retombe sur le provider
   * chain (Twilio/Meta/AT) au lieu de pendre. Configurable via WA_SEND_TIMEOUT_MS.
   */
  private withSendTimeout<T>(fn: () => Promise<T>): Promise<T> {
    const ms = Number(process.env.WA_SEND_TIMEOUT_MS ?? 60000);
    let timer: ReturnType<typeof setTimeout>;
    const p = fn();
    // Si l'envoi rejette APRES le timeout (la page se debloque tard), on evite
    // un unhandledRejection en absorbant le resultat tardif.
    p.catch(() => {});
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`WA send timeout apres ${ms}ms`)), ms);
    });
    return Promise.race([p, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
  }

  /**
   * Envoie un media (image ou document) WhatsApp depuis la session du tenant.
   * Les images sont envoyees inline avec une legende ; les documents (PDF)
   * comme fichier. Le media est telecharge depuis `url` puis envoye en base64
   * (robuste : ne depend pas de l'accessibilite de l'URL par WhatsApp).
   *
   * @returns true si envoye, false si rate limite / session inactive / erreur.
   */
  async sendMedia(
    organizationId: string,
    phone: string,
    url: string,
    opts?: { caption?: string; filename?: string; asDocument?: boolean },
  ): Promise<boolean> {
    const client = this.clients.get(organizationId);
    if (!client) return false;

    const session = await prisma.tenantWhatsAppSession.findUnique({
      where: { organizationId },
    });
    if (!session || session.status !== 'CONNECTED') return false;

    const limiter = this.getOrCreateLimiter(
      organizationId,
      session.rateLimitPerHour,
      session.minDelaySeconds * 1000,
    );
    const check = limiter.canSend();
    if (!check.ok) {
      logger.warn({ organizationId, waitMs: check.waitMs }, 'WA rate limit hit (media)');
      return false;
    }

    try {
      const { MessageMedia } = await import('whatsapp-web.js');
      const res = await fetch(url);
      if (!res.ok) {
        logger.warn({ organizationId, url, status: res.status }, 'WA media fetch failed');
        return false;
      }
      const contentType = res.headers.get('content-type') || 'application/octet-stream';
      const buffer = Buffer.from(await res.arrayBuffer());
      const media = new MessageMedia(
        contentType,
        buffer.toString('base64'),
        opts?.filename ?? 'fichier',
      );
      const chatId = phone.replace(/[^0-9]/g, '') + '@c.us';
      await this.withSendTimeout(() =>
        client.sendMessage(chatId, media, {
          caption: opts?.caption,
          sendMediaAsDocument: opts?.asDocument ?? false,
        }),
      );
      limiter.consume();
      return true;
    } catch (err) {
      logger.error({ err, organizationId, phone, url }, 'WA sendMedia failed');
      return false;
    }
  }

  /**
   * Retourne l'état courant d'une session (pour l'API status).
   */
  async getStatus(organizationId: string): Promise<WaSessionState> {
    const session = await prisma.tenantWhatsAppSession.findUnique({
      where: { organizationId },
      select: { status: true, qrCode: true, connectedPhone: true, lastError: true },
    });
    return {
      status: (session?.status as WaSessionStatus) ?? 'DISCONNECTED',
      qrCode: session?.qrCode ?? null,
      connectedPhone: session?.connectedPhone ?? null,
      lastError: session?.lastError ?? null,
    };
  }

  async updateRateLimit(organizationId: string, perHour: number, minDelaySeconds: number): Promise<void> {
    await prisma.tenantWhatsAppSession.upsert({
      where: { organizationId },
      create: { organizationId, rateLimitPerHour: perHour, minDelaySeconds },
      update: { rateLimitPerHour: perHour, minDelaySeconds },
    });
    const limiter = this.limiters.get(organizationId);
    if (limiter) limiter.update(perHour, minDelaySeconds * 1000);
    logger.info({ organizationId, perHour, minDelaySeconds }, 'Rate limit updated');
  }

  /** Vérifie si une session CONNECTED existe pour ce tenant (pour le provider). */
  isConnected(organizationId: string): boolean {
    return this.clients.has(organizationId);
  }

  // ── Privé ──────────────────────────────────────────────────────────────────

  private getOrCreateLimiter(orgId: string, perHour: number, minDelayMs: number): RateLimiter {
    if (!this.limiters.has(orgId)) {
      this.limiters.set(orgId, new RateLimiter(perHour, minDelayMs));
    }
    return this.limiters.get(orgId)!;
  }

  private async updateDbStatus(
    organizationId: string,
    status: WaSessionStatus,
    qrCode: string | null,
    connectedPhone: string | null,
    lastError: string | null,
  ): Promise<void> {
    try {
      await prisma.tenantWhatsAppSession.upsert({
        where: { organizationId },
        create: {
          organizationId,
          status,
          qrCode,
          connectedPhone,
          lastError,
          connectedAt: status === 'CONNECTED' ? new Date() : undefined,
        },
        update: {
          status,
          qrCode,
          connectedPhone,
          lastError,
          ...(status === 'CONNECTED' ? { connectedAt: new Date() } : {}),
        },
      });
    } catch (err) {
      logger.warn({ err, organizationId }, 'Failed to update WA session in DB');
    }
  }

  private async notifyFailure(organizationId: string, phone: string, error: string): Promise<void> {
    try {
      const org = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { name: true, email: true, supportEmail: true },
      });
      const superAdminEmail = process.env.SUPER_ADMIN_EMAIL;
      const tenantEmail = org?.supportEmail || org?.email;
      const subject = `[${org?.name ?? organizationId}] Échec d'envoi WhatsApp`;
      const body = `<p>Un message WhatsApp vers <strong>${phone}</strong> a échoué :</p><pre>${error}</pre>`;

      if (tenantEmail) await emailService.send(tenantEmail, subject, body, organizationId);
      if (superAdminEmail && superAdminEmail !== tenantEmail) {
        await emailService.send(superAdminEmail, subject, body, null);
      }
    } catch (err) {
      logger.warn({ err }, 'notifyFailure email failed');
    }
  }

  private async notifyBan(organizationId: string): Promise<void> {
    try {
      const org = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { name: true, email: true, supportEmail: true },
      });
      const superAdminEmail = process.env.SUPER_ADMIN_EMAIL;
      const tenantEmail = org?.supportEmail || org?.email;
      const subject = `[${org?.name ?? organizationId}] Compte WhatsApp banni`;
      const body = `<p>Le compte WhatsApp de <strong>${org?.name ?? organizationId}</strong> a été banni par WhatsApp. Veuillez reconnectez un nouveau numéro depuis le dashboard.</p>`;
      if (tenantEmail) await emailService.send(tenantEmail, subject, body, organizationId);
      if (superAdminEmail && superAdminEmail !== tenantEmail) {
        await emailService.send(superAdminEmail, subject, body, null);
      }
    } catch (err) {
      logger.warn({ err }, 'notifyBan email failed');
    }
  }
}

export const tenantWaSessionService = TenantWhatsAppSessionService.getInstance();
