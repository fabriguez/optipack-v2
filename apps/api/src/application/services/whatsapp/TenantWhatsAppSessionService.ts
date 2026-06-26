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
  // Recovery auto d'une page WA Web JS figee : echecs d'envoi consecutifs par
  // tenant + horodatage du dernier recyclage (cooldown anti-thrash) + verrou.
  private sendFailures = new Map<string, number>();
  private lastRecycleAt = new Map<string, number>();
  private recycling = new Set<string>();
  // Serialisation des envois par tenant : whatsapp-web.js partage UNE page
  // puppeteer ; des sendMessage concurrents -> commandes CDP entrelacees ->
  // hang/timeout. On enchaine les envois d'un meme tenant.
  private sendQueues = new Map<string, Promise<unknown>>();

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

    // Nettoie un verrou Chromium residuel d'un crash/restart/destroy precedent.
    // Sans ca, le launch echoue avec "browser already running" (verrou
    // SingletonLock orphelin dans le userDataDir). Sur ce chemin on a deja
    // verifie qu'aucun client n'est suivi pour ce tenant -> safe.
    await this.clearBrowserLock(organizationId);

    // Import dynamique pour éviter crash si puppeteer non dispo en dev
    const { Client, LocalAuth } = await import('whatsapp-web.js');

    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: organizationId,
        dataPath: this.authDir,
      }),
      puppeteer: {
        headless: true,
        // WA_DEBUG=1 -> pipe la sortie stdio de Chromium (crash renderer, erreurs
        // GPU/sandbox, logs internes) dans les logs du conteneur. Tres utile pour
        // diagnostiquer un LOGOUT/crash post-scan.
        dumpio: process.env.WA_DEBUG === '1',
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
      // Pin de version WhatsApp Web (opt-in via WA_WEB_VERSION, ex 2.3000.1023XXXXXX).
      // Cause frequente d'un sendMessage qui pend indefiniment : le bundle WA Web
      // par defaut a derive et la fonction d'envoi injectee n'est plus prete.
      // Pinner une version stable (catalogue wppconnect-team/wa-version) corrige.
      ...(process.env.WA_WEB_VERSION
        ? {
            webVersion: process.env.WA_WEB_VERSION,
            webVersionCache: {
              type: 'remote' as const,
              remotePath: `https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/${process.env.WA_WEB_VERSION}.html`,
            },
          }
        : {}),
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

    // Progression du chargement de WhatsApp Web (diagnostic : si ca reste
    // bloque a un faible % -> bundle WA Web qui ne charge pas, souvent corrige
    // en pinnant WA_WEB_VERSION ou en ajoutant les polices Chromium).
    client.on('loading_screen', (percent: number, message: string) => {
      logger.info({ organizationId, percent, message }, 'WA loading screen');
      this.hookPupPageConsole(organizationId, client);
    });

    // change_state : transitions d'etat WA (CONNECTED, OPENING, PAIRING,
    // UNPAIRED, CONFLICT, DEPRECATED_VERSION, TIMEOUT...). C'est ICI qu'on voit
    // POURQUOI ca se deconnecte apres le scan (ex: CONFLICT = autre session
    // active ; DEPRECATED_VERSION = WA_WEB_VERSION incompatible -> LOGOUT).
    client.on('change_state', (state: string) => {
      logger.warn({ organizationId, state }, 'WA change_state');
      this.hookPupPageConsole(organizationId, client);
    });

    // Watchdog : si NI 'qr' NI 'ready' n'arrivent dans le delai imparti, la page
    // WA Web est probablement figee (Chromium sans polices, version WA derivee,
    // RAM insuffisante). On surface l'erreur au lieu de laisser le spinner
    // tourner indefiniment cote UI.
    const qrTimeoutMs = Number(process.env.WA_QR_TIMEOUT_MS ?? 180000);
    const watchdog = setTimeout(() => {
      void (async () => {
        const st = await this.getStatus(organizationId).catch(() => null);
        if (st && (st.status === 'CONNECTING')) {
          logger.error({ organizationId }, 'WA QR watchdog: aucun QR/ready -> page figee');
          await this.updateDbStatus(
            organizationId,
            'DISCONNECTED',
            null,
            null,
            "WhatsApp Web n'a pas pu charger (timeout). Reessayez ; si le probleme persiste, definir WA_WEB_VERSION.",
          ).catch(() => {});
          try {
            await this.clients.get(organizationId)?.destroy();
          } catch { /* ignore */ }
          this.clients.delete(organizationId);
        }
      })();
    }, qrTimeoutMs);
    // Annule le watchdog des qu'un QR ou un ready arrive.
    this.once(`qr:${organizationId}`, () => clearTimeout(watchdog));
    this.once(`ready:${organizationId}`, () => clearTimeout(watchdog));

    // NON bloquant : un hang d'initialize ne doit pas figer l'appelant. Le QR
    // arrive via l'event 'qr'. On capture toute erreur d'init pour la rendre
    // visible (lastError) au lieu d'un spinner silencieux.
    client.initialize().catch(async (err) => {
      clearTimeout(watchdog);
      this.clients.delete(organizationId);
      await this.updateDbStatus(
        organizationId,
        'DISCONNECTED',
        null,
        null,
        `Initialisation WhatsApp echouee: ${(err as Error)?.message ?? String(err)}`,
      ).catch(() => {});
      logger.error({ err, organizationId }, 'WA initialize failed');
    });
  }

  /**
   * Déconnecte et détruit la session du tenant.
   */
  async destroySession(organizationId: string): Promise<void> {
    const client = this.clients.get(organizationId);
    this.clients.delete(organizationId);
    if (client) {
      // On NE fait PAS logout() d'abord : logout() evalue dans la page WA et
      // peut hang (~180s, ProtocolError) si la page est figee, laissant un
      // Chromium ZOMBIE qui garde le verrou du userDataDir -> "browser already
      // running" au prochain start. destroy() tue le navigateur ; on borne le
      // temps et on force le kill du process au pire.
      try {
        await this.withTimeout(() => client.destroy(), 20000, 'WA destroy');
      } catch (err) {
        logger.warn({ err, organizationId }, 'WA destroy timeout -> kill force du navigateur');
        try {
          (client as unknown as {
            pupBrowser?: { process?: () => { kill: (sig: string) => void } | null };
          }).pupBrowser?.process?.()?.kill('SIGKILL');
        } catch {
          /* ignore */
        }
      }
    }
    // Disconnect = DESAPPAIRAGE complet : on supprime le dossier d'auth du
    // tenant. Sinon LocalAuth restaure une session potentiellement corrompue/
    // figee au prochain start (-> blocage apres scan). Apres ca, la prochaine
    // connexion repart sur un QR neuf et propre.
    await this.removeSessionDir(organizationId);
    this.limiters.delete(organizationId);
    await this.updateDbStatus(organizationId, 'DISCONNECTED', null, null, null);
    logger.info({ organizationId }, 'Session destroyed');
  }

  // Pages puppeteer deja instrumentees (evite d'attacher 2x les listeners).
  private hookedPages = new WeakSet<object>();

  /**
   * Attache (une seule fois, si WA_DEBUG=1) les listeners console/erreur de la
   * PAGE puppeteer WhatsApp Web -> on voit dans les logs du conteneur ce que la
   * page logue/jette (utile pour comprendre un LOGOUT post-scan).
   */
  private hookPupPageConsole(organizationId: string, client: import('whatsapp-web.js').Client): void {
    if (process.env.WA_DEBUG !== '1') return;
    const page = (client as unknown as { pupPage?: any }).pupPage;
    if (!page || this.hookedPages.has(page)) return;
    this.hookedPages.add(page);
    try {
      page.on('console', (msg: { type?: () => string; text?: () => string }) => {
        logger.info(
          { organizationId, level: msg.type?.(), text: msg.text?.() },
          'WA page console',
        );
      });
      page.on('pageerror', (err: Error) => {
        logger.warn({ organizationId, err: err?.message }, 'WA page error');
      });
    } catch {
      /* best-effort */
    }
  }

  /** Supprime tout le dossier d'auth d'un tenant (desappairage complet). */
  private async removeSessionDir(organizationId: string): Promise<void> {
    try {
      const fs = await import('node:fs/promises');
      const dir = path.join(this.authDir, `session-${organizationId}`);
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    } catch {
      /* best-effort */
    }
  }

  /**
   * Supprime les verrous singleton Chromium du userDataDir d'un tenant. A
   * appeler avant un (re)launch ou apres un kill force, sinon puppeteer refuse
   * de demarrer avec "The browser is already running ... Use a different
   * userDataDir or stop the running browser first.".
   */
  private async clearBrowserLock(organizationId: string): Promise<void> {
    try {
      const fs = await import('node:fs/promises');
      const dir = path.join(this.authDir, `session-${organizationId}`);
      await Promise.all(
        ['SingletonLock', 'SingletonCookie', 'SingletonSocket'].map((f) =>
          fs.rm(path.join(dir, f), { force: true }).catch(() => {}),
        ),
      );
    } catch {
      /* best-effort */
    }
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

    try {
      const chatId = phone.replace(/[^0-9]/g, '') + '@c.us';
      // Rate limit gere DANS la file serialisee : on ATTEND le slot (borne) au
      // lieu de dropper le message. consume() apres l'envoi -> lastSentAt a jour.
      const sent = await this.enqueueSend(organizationId, async () => {
        if (!(await this.waitForSlot(limiter, organizationId, 'text'))) return false;
        if (!(await this.isPageResponsive(client))) {
          throw new Error('WA page non reactive (getState timeout)');
        }
        await this.withSendTimeout(() => client.sendMessage(chatId, message));
        limiter.consume();
        return true;
      });
      if (!sent) return false;
      this.sendFailures.delete(organizationId);
      return true;
    } catch (err) {
      logger.error({ err, organizationId, phone }, 'WA sendMessage failed');
      this.onSendFailure(organizationId);
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
  /**
   * Enchaine les envois d'un meme tenant (un seul a la fois) pour eviter les
   * commandes CDP concurrentes sur la page puppeteer partagee.
   */
  private enqueueSend<T>(organizationId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.sendQueues.get(organizationId) ?? Promise.resolve();
    const run = prev.then(fn, fn);
    // Garde la chaine vivante sans propager les rejets au maillon suivant.
    this.sendQueues.set(organizationId, run.then(() => undefined, () => undefined));
    return run;
  }

  private withSendTimeout<T>(fn: () => Promise<T>): Promise<T> {
    return this.withTimeout(fn, Number(process.env.WA_SEND_TIMEOUT_MS ?? 60000), 'WA send');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  /**
   * Attend qu'un slot d'envoi se libere (min-delay entre messages / quota
   * horaire) au lieu de DROPPER l'envoi. Borne par WA_RATE_WAIT_MAX_MS (defaut
   * 30s) : si l'attente requise depasse ce plafond (ex quota horaire epuise),
   * on abandonne. A appeler DANS la file serialisee (enqueueSend) pour que
   * lastSentAt soit a jour entre deux envois du meme tenant.
   */
  private async waitForSlot(
    limiter: RateLimiter,
    organizationId: string,
    kind: string,
  ): Promise<boolean> {
    const maxWaitMs = Number(process.env.WA_RATE_WAIT_MAX_MS ?? 30000);
    let waited = 0;
    for (;;) {
      const c = limiter.canSend();
      if (c.ok) return true;
      const w = c.waitMs ?? 1000;
      if (waited + w > maxWaitMs) {
        logger.warn(
          { organizationId, kind, waitMs: w, waited },
          'WA rate limit: attente trop longue -> envoi abandonne',
        );
        return false;
      }
      await this.sleep(w);
      waited += w;
    }
  }

  private withTimeout<T>(fn: () => Promise<T>, ms: number, label: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout>;
    const p = fn();
    // Si l'op rejette APRES le timeout (la page se debloque tard), on evite un
    // unhandledRejection en absorbant le resultat tardif.
    p.catch(() => {});
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timeout apres ${ms}ms`)), ms);
    });
    return Promise.race([p, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
  }

  /**
   * Sonde rapide de reactivite de la page : getState() borne (defaut 8s). Si la
   * page WA Web est figee, getState pend aussi -> on echoue en 8s au lieu de
   * 60s, ce qui evite de bruler le timeout d'envoi et declenche le recyclage
   * plus tot. Retourne true seulement si l'etat est CONNECTED.
   */
  private async isPageResponsive(client: import('whatsapp-web.js').Client): Promise<boolean> {
    const ms = Number(process.env.WA_PROBE_TIMEOUT_MS ?? 8000);
    try {
      const state = await this.withTimeout(() => client.getState(), ms, 'WA getState');
      return state === 'CONNECTED';
    } catch {
      return false;
    }
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
      // Rate limit DANS la file serialisee : on ATTEND le slot (borne) au lieu
      // de dropper le media (sinon une PJ envoyee juste apres le texte se perd).
      const sent = await this.enqueueSend(organizationId, async () => {
        if (!(await this.waitForSlot(limiter, organizationId, 'media'))) return false;
        if (!(await this.isPageResponsive(client))) {
          throw new Error('WA page non reactive (getState timeout)');
        }
        await this.withSendTimeout(() =>
          client.sendMessage(chatId, media, {
            caption: opts?.caption,
            sendMediaAsDocument: opts?.asDocument ?? false,
          }),
        );
        limiter.consume();
        return true;
      });
      if (!sent) return false;
      this.sendFailures.delete(organizationId);
      return true;
    } catch (err) {
      logger.error({ err, organizationId, phone, url }, 'WA sendMedia failed');
      this.onSendFailure(organizationId);
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

  /**
   * Comptabilise un echec d'envoi. Au-dela d'un seuil de timeouts/echecs
   * consecutifs, la page WA Web JS est probablement figee (puppeteer wedged) :
   * on recycle la session (destroy SANS logout -> re-init -> reconnexion sans
   * QR grace a LocalAuth). Cooldown pour eviter le thrash.
   * Seuil/cooldown configurables (WA_RECYCLE_THRESHOLD, WA_RECYCLE_COOLDOWN_MS).
   */
  private onSendFailure(organizationId: string): void {
    const n = (this.sendFailures.get(organizationId) ?? 0) + 1;
    this.sendFailures.set(organizationId, n);
    const threshold = Number(process.env.WA_RECYCLE_THRESHOLD ?? 1);
    const cooldownMs = Number(process.env.WA_RECYCLE_COOLDOWN_MS ?? 120000);
    if (n < threshold) return;
    const last = this.lastRecycleAt.get(organizationId) ?? 0;
    if (Date.now() - last < cooldownMs) return;
    this.sendFailures.set(organizationId, 0);
    this.lastRecycleAt.set(organizationId, Date.now());
    // Fire-and-forget : recupere les ENVOIS SUIVANTS (le courant a deja echoue).
    void this.recycleSession(organizationId);
  }

  /**
   * Recycle la session : detruit le navigateur puppeteer (SANS logout, donc
   * sans invalider l'appairage) puis relance startSession. LocalAuth restaure
   * la session depuis le disque -> reconnexion sans nouveau QR.
   */
  private async recycleSession(organizationId: string): Promise<void> {
    if (this.recycling.has(organizationId)) return;
    this.recycling.add(organizationId);
    const client = this.clients.get(organizationId);
    // Retire de la map d'abord : isConnected() -> false pendant le recyclage,
    // donc deliverWhatsapp bascule sur le provider chain en attendant.
    this.clients.delete(organizationId);
    try {
      logger.warn({ organizationId }, 'WA session figee -> recyclage (destroy + re-init sans QR)');
      if (client) {
        try {
          await this.withTimeout(() => client.destroy(), 20000, 'WA recycle destroy');
        } catch (err) {
          logger.warn({ err, organizationId }, 'WA recycle: destroy timeout/echec -> kill force');
          try {
            (client as unknown as {
              pupBrowser?: { process?: () => { kill: (sig: string) => void } | null };
            }).pupBrowser?.process?.()?.kill('SIGKILL');
          } catch {
            /* ignore */
          }
        }
      }
      // startSession nettoie le verrou residuel avant de relancer.
      await this.startSession(organizationId);
      logger.info({ organizationId }, 'WA session recyclee');
    } catch (err) {
      logger.error({ err, organizationId }, 'WA recycle: re-init a echoue');
    } finally {
      this.recycling.delete(organizationId);
    }
  }

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
