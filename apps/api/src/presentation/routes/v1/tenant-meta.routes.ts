import { Router } from 'express';
import { prisma } from '../../../config/database';
import { config } from '../../../config';
import { authenticate, authorize, requirePermission } from '../../middleware/authMiddleware';
import { tenantGuard, getOrgId } from '../../middleware/tenantGuard';
import { isKnownSkinId, listSkins, isKnownThemeId, listThemes } from '@transitsoftservices/skins';
import {
  emailConfigSchema,
  mobileAppConfigSchema,
  type EmailConfig,
  type EmailConfigPublic,
  type MobileAppConfig,
} from '@transitsoftservices/shared';
import { tenantEmailDispatcher } from '../../../infrastructure/email/TenantEmailDispatcher';
import { realtimeService } from '../../../infrastructure/realtime/RealtimeService';
import { emailService } from '../../../infrastructure/email/EmailService';

/** Strip secrets before returning email config to clients. */
function publicEmailConfig(cfg: EmailConfig | null | undefined): EmailConfigPublic | null {
  if (!cfg) return null;
  const apiKey = cfg.credentials?.apiKey;
  return {
    provider: cfg.provider,
    senderEmail: cfg.senderEmail,
    senderName: cfg.senderName,
    replyTo: cfg.replyTo,
    verifiedAt: cfg.verifiedAt,
    dkimStatus: cfg.dkimStatus,
    dnsRecords: cfg.dnsRecords,
    apiKeyHint: apiKey ? `****${apiKey.slice(-4)}` : undefined,
  };
}

const router = Router();

// Alias : /public === /  (mobile et tablette appellent /tenant-meta/public).
router.use((req, _res, next) => {
  if (req.path === '/public') req.url = '/';
  next();
});

// Retourne l'URL publique du logo du tenant (proxied, sans auth).
function publicLogoUrl(orgId: string, rawUrl: string | null): string | null {
  if (!rawUrl) return null;
  return `${config.apiUrl}/api/v1/uploads/public-logo/${orgId}`;
}

/**
 * Service-token middleware for ops -> tenant sync. The orchestrator pushes
 * updates here whenever an ops-admin saves the tenant Studio so the running
 * tenant-api reflects branding/modules/skin without provisioning churn.
 */
function requireServiceToken(req: any, res: any, next: any) {
  const expected = process.env.OPS_TENANT_PROXY_TOKEN ?? '';
  if (!expected) {
    return res.status(503).json({ success: false, message: 'Service token non configure' });
  }
  if (req.headers['x-service-token'] !== expected) {
    return res.status(401).json({ success: false, message: 'Service token invalide' });
  }
  next();
}

/**
 * PATCH /api/v1/tenant-meta/ops-sync
 * Called server-to-server by the orchestrator. Updates the Organization row
 * with branding/modules/skin pushed from ops-admin. Auth via service token.
 * The tenant id is resolved either from `X-Tenant-Id` header (orchestrator's
 * own tenant id) or, falling back, from the single Organization row.
 */
router.patch('/ops-sync', requireServiceToken, async (req, res, next) => {
  try {
    const tenantId = (req.headers['x-tenant-id'] as string | undefined) ?? undefined;
    const body = req.body as {
      name?: string;
      logoUrl?: string | null;
      primaryColor?: string;
      secondaryColor?: string;
      accentColor?: string;
      enabledModules?: string[];
      skinId?: string | null;
      themeId?: string | null;
      skinCustomization?: unknown;
    };

    // Locate the Organization row. Tenant id from orchestrator may match the
    // Organization id (single-org-per-api convention). Otherwise fall back to
    // the unique Organization in this db.
    let org = tenantId
      ? await prisma.organization.findUnique({ where: { id: tenantId } })
      : null;
    if (!org) {
      org = await prisma.organization.findFirst();
    }
    if (!org) {
      return res.status(404).json({ success: false, message: 'Organization introuvable' });
    }

    if (body.skinId && !isKnownSkinId(body.skinId)) {
      return res.status(400).json({ success: false, message: `skinId inconnu : ${body.skinId}` });
    }
    if (body.themeId && !isKnownThemeId(body.themeId)) {
      return res.status(400).json({ success: false, message: `themeId inconnu : ${body.themeId}` });
    }

    const updated = await prisma.organization.update({
      where: { id: org.id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.logoUrl !== undefined && { logoUrl: body.logoUrl }),
        ...(body.primaryColor !== undefined && { primaryColor: body.primaryColor }),
        ...(body.secondaryColor !== undefined && { secondaryColor: body.secondaryColor }),
        ...(body.accentColor !== undefined && { accentColor: body.accentColor }),
        ...(body.enabledModules !== undefined && { enabledModules: body.enabledModules }),
        ...(body.skinId !== undefined && { skinId: body.skinId } as any),
        ...(body.themeId !== undefined && { themeId: body.themeId } as any),
        ...(body.skinCustomization !== undefined && {
          skinCustomization: body.skinCustomization,
        } as any),
      },
    });

    emailService.invalidateBranding(updated.id);
    // Broadcast realtime aux clients web/web-client connectes : skin + modules
    // doivent s'appliquer immediatement sans reload. Cle 'tenant:meta:updated'
    // ecoutee par TenantProvider (web) et TenantMetaProvider (web-client).
    try {
      realtimeService.toOrganization(updated.id, 'tenant:meta:updated', {
        organizationId: updated.id,
        changedFields: Object.keys(body),
      });
    } catch {
      // non bloquant : si le broadcast echoue, le prochain reload prendra le relais
    }

    res.json({ success: true, data: { id: updated.id } });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/tenant-meta/reset-owner-password
 * Called by the orchestrator (service token). Regenerates the SUPER_ADMIN
 * owner password to a strong random value, returns plaintext one-shot.
 * Tenant id from X-Tenant-Id header (or fallback first org).
 *
 * Body : { ownerEmail?: string } (override target user, default = first
 * SUPER_ADMIN of the org).
 */
router.post('/reset-owner-password', requireServiceToken, async (req, res, next) => {
  try {
    const { randomBytes } = await import('node:crypto');
    const bcrypt = (await import('bcryptjs')).default;
    const tenantId = (req.headers['x-tenant-id'] as string | undefined) ?? undefined;
    const overrideEmail = (req.body?.ownerEmail as string | undefined) ?? undefined;

    let org = tenantId
      ? await prisma.organization.findUnique({ where: { id: tenantId } })
      : null;
    if (!org) org = await prisma.organization.findFirst();
    if (!org) {
      return res.status(404).json({ success: false, message: 'Organization introuvable' });
    }

    // Cible : user explicite OU premier SUPER_ADMIN de l'org
    const user = overrideEmail
      ? await prisma.user.findFirst({ where: { organizationId: org.id, email: overrideEmail } })
      : await prisma.user.findFirst({
          where: { organizationId: org.id, role: 'SUPER_ADMIN' as never, isActive: true },
          orderBy: { createdAt: 'asc' },
        });
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: 'Aucun user admin trouve pour ce tenant' });
    }

    const newPassword = randomBytes(12).toString('base64url');
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    res.json({
      success: true,
      data: { email: user.email, password: newPassword, userId: user.id },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/tenant-meta
 * PUBLIC : pas d'auth. Renvoie le branding + modules actifs du tenant courant.
 *
 * Le tenant est identifie via :
 * - le header `Host` (subdomain) -> Organization.slug
 * - ou un header explicite `X-Tenant-Slug`
 * - ou la variable d'env `TENANT_SLUG` (en dev, pour le tenant unique)
 *
 * Utilise au boot du frontend pour appliquer le theme dynamiquement.
 */
router.get('/', async (req, res, next) => {
  try {
    const explicitSlug =
      (req.headers['x-tenant-slug'] as string | undefined) ||
      process.env.TENANT_SLUG;

    let slug = explicitSlug;
    if (!slug && req.headers.host) {
      // ex: acme.transitsoftservices.com -> acme
      const host = String(req.headers.host).split(':')[0];
      const parts = host.split('.');
      if (parts.length >= 3) {
        slug = parts[0];
      }
    }

    let org = null;
    if (slug) {
      org = await prisma.organization.findFirst({ where: { slug } });
    }
    // Fallback : si pas de slug ou pas trouve, prendre la premiere org (dev / single-tenant)
    if (!org) {
      org = await prisma.organization.findFirst();
    }

    if (!org) {
      return res.status(404).json({ success: false, message: 'Tenant introuvable' });
    }

    res.json({
      success: true,
      data: {
        id: org.id,
        slug: org.slug,
        name: org.name,
        logoUrl: publicLogoUrl(org.id, org.logoUrl),
        primaryColor: org.primaryColor,
        secondaryColor: org.secondaryColor,
        accentColor: org.accentColor,
        modules: org.enabledModules ?? [],
        supportEmail: org.supportEmail,
        defaultCurrency: org.defaultCurrency,
        defaultLanguage: org.defaultLanguage,
        // Skin = layout du site public. Theme = palette. Independants :
        // n'importe quel theme avec n'importe quel skin.
        skin: (org as any).skinId ?? null,
        theme: (org as any).themeId ?? null,
        skinCustomization: (org as any).skinCustomization ?? null,
        // Flag : ce tenant est le tenant principal "SaaS owner". Active la
        // banniere d'invitation a creer son propre tenant sur la home publique.
        // Provient de l'env OPS_IS_MAIN_TENANT injectee par l'orchestrator
        // au provisioning du tenant principal.
        isMain: process.env.OPS_IS_MAIN_TENANT === 'true',
        // Email config (secrets stripped).
        emailConfig: publicEmailConfig((org as any).emailConfig as EmailConfig | null),
        // Mobile app config (white-label).
        mobileAppConfig: (org as any).mobileAppConfig as MobileAppConfig | null,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/v1/organization/branding
 * AUTH admin du tenant. Permet de modifier les couleurs / logo / nom.
 * Bouton "Personnalisation" dans le dashboard tenant.
 */
router.patch(
  '/branding',
  authenticate,
  tenantGuard,
  authorize('SUPER_ADMIN', 'ADMIN'),
  // ABAC : personnalisation branding (authorize conserve en garde dure).
  requirePermission('branding.manage'),
  async (req, res, next) => {
    try {
      const orgId = getOrgId(req);
      const body = req.body as {
        logoUrl?: string | null;
        primaryColor?: string;
        secondaryColor?: string;
        accentColor?: string;
        supportEmail?: string | null;
        name?: string;
      };
      const { logoUrl, primaryColor, secondaryColor, accentColor, supportEmail, name } = body;

      const hexRe = /^#[0-9A-Fa-f]{6}$/;
      const checks = [
        ['primaryColor', primaryColor],
        ['secondaryColor', secondaryColor],
        ['accentColor', accentColor],
      ] as const;
      for (const [field, val] of checks) {
        if (val && !hexRe.test(val)) {
          return res
            .status(400)
            .json({ success: false, message: `${field} doit etre au format hex #XXXXXX` });
        }
      }

      // Si logoUrl est notre propre URL proxy publique (retournee par GET /tenant-meta),
      // ne pas l'ecrire en DB : garder l'URL raw du bucket. Null = suppression voulue.
      const isPublicProxy = (u: string | null | undefined): boolean =>
        typeof u === 'string' && u.includes('/api/v1/uploads/public-logo/');
      const shouldUpdateLogo = logoUrl !== undefined && !isPublicProxy(logoUrl);

      const updated = await prisma.organization.update({
        where: { id: orgId },
        data: {
          ...(name !== undefined && { name }),
          ...(shouldUpdateLogo && { logoUrl }),
          ...(primaryColor !== undefined && { primaryColor }),
          ...(secondaryColor !== undefined && { secondaryColor }),
          ...(accentColor !== undefined && { accentColor }),
          ...(supportEmail !== undefined && { supportEmail }),
        },
      });

      emailService.invalidateBranding(updated.id);
      try {
        realtimeService.toOrganization(updated.id, 'tenant:meta:updated', {
          organizationId: updated.id,
          changedFields: ['branding'],
        });
      } catch {
        // non bloquant
      }

      res.json({
        success: true,
        data: {
          id: updated.id,
          name: updated.name,
          logoUrl: publicLogoUrl(updated.id, updated.logoUrl),
          primaryColor: updated.primaryColor,
          secondaryColor: updated.secondaryColor,
          accentColor: updated.accentColor,
          supportEmail: updated.supportEmail,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/tenant-meta/payment-providers
 * AUTH admin. Liste des providers disponibles + canaux.
 */
router.get(
  '/payment-providers',
  authenticate,
  tenantGuard,
  authorize('SUPER_ADMIN', 'ADMIN'),
  // ABAC : lecture des reglages = settings.read.
  requirePermission('settings.read'),
  async (_req, res, next) => {
    try {
      const { listPaymentProviders } = await import('../../../infrastructure/payments/registry');
      const providers = listPaymentProviders().map((p) => ({ name: p.name, channel: p.channel }));
      res.json({ success: true, data: providers });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/tenant-meta/payment-config
 * AUTH admin. Renvoie la config providers du tenant (secrets visibles : admin only).
 */
router.get(
  '/payment-config',
  authenticate,
  tenantGuard,
  authorize('SUPER_ADMIN', 'ADMIN'),
  // ABAC : lecture credentials paiement = settings.read.
  requirePermission('settings.read'),
  async (req, res, next) => {
    try {
      const orgId = getOrgId(req);
      const org = await prisma.organization.findUnique({
        where: { id: orgId },
        select: { paymentProvidersConfig: true },
      });
      res.json({ success: true, data: org?.paymentProvidersConfig ?? { channels: [] } });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /api/v1/tenant-meta/payment-config
 * AUTH admin. Met a jour la config providers (canaux, priorites, credentials).
 */
router.patch(
  '/payment-config',
  authenticate,
  tenantGuard,
  authorize('SUPER_ADMIN', 'ADMIN'),
  // ABAC : mutation config paiement = system.config.
  requirePermission('system.config'),
  async (req, res, next) => {
    try {
      const orgId = getOrgId(req);
      const body = req.body as { channels?: unknown } | null | undefined;
      if (!body || !Array.isArray(body.channels)) {
        return res.status(400).json({ success: false, message: 'channels[] requis' });
      }
      const updated = await prisma.organization.update({
        where: { id: orgId },
        data: { paymentProvidersConfig: body as any },
        select: { paymentProvidersConfig: true },
      });
      res.json({ success: true, data: updated.paymentProvidersConfig });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/tenant-meta/skins
 * PUBLIC : liste des peaux disponibles (catalogue) pour le Studio cote tenant.
 * Utilise le registre central de @transitsoftservices/skins, donc ajouter une
 * nouvelle peau ne requiert qu'une modif du package partage.
 */
router.get('/skins', (_req, res) => {
  res.json({ success: true, data: listSkins() });
});

/**
 * GET /api/v1/tenant-meta/themes
 * PUBLIC : liste des themes (palettes) disponibles. Independant des skins.
 */
router.get('/themes', (_req, res) => {
  res.json({ success: true, data: listThemes() });
});

/**
 * PATCH /api/v1/tenant-meta/skin
 * AUTH admin. Persiste skinId (layout) + themeId (palette) + overrides.
 * Les 2 sont independants : skin = layout du site, theme = couleurs.
 */
router.patch(
  '/skin',
  authenticate,
  tenantGuard,
  authorize('SUPER_ADMIN', 'ADMIN'),
  // ABAC : skin/theme du site vitrine = sitestudio.manage.
  requirePermission('sitestudio.manage'),
  async (req, res, next) => {
    try {
      const orgId = getOrgId(req);
      const body = req.body as {
        skinId?: string | null;
        themeId?: string | null;
        skinCustomization?: unknown;
      };

      if (body.skinId && !isKnownSkinId(body.skinId)) {
        return res
          .status(400)
          .json({ success: false, message: `skinId inconnu : ${body.skinId}` });
      }
      if (body.themeId && !isKnownThemeId(body.themeId)) {
        return res
          .status(400)
          .json({ success: false, message: `themeId inconnu : ${body.themeId}` });
      }

      const updated = await prisma.organization.update({
        where: { id: orgId },
        data: {
          ...(body.skinId !== undefined && { skinId: body.skinId } as any),
          ...(body.themeId !== undefined && { themeId: body.themeId } as any),
          ...(body.skinCustomization !== undefined && {
            skinCustomization: body.skinCustomization,
          } as any),
        },
      });

      try {
        realtimeService.toOrganization(updated.id, 'tenant:meta:updated', {
          organizationId: updated.id,
          changedFields: ['skin', 'theme', 'skinCustomization'],
        });
      } catch {
        // non bloquant
      }

      res.json({
        success: true,
        data: {
          id: updated.id,
          skin: (updated as any).skinId ?? null,
          theme: (updated as any).themeId ?? null,
          skinCustomization: (updated as any).skinCustomization ?? null,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /api/v1/tenant-meta/email-config
 * AUTH admin. Met a jour le provider + sender + credentials.
 * Le secret (apiKey) est conserve en BDD ; le GET ne renvoie que les 4
 * derniers caracteres via `apiKeyHint`.
 */
router.patch(
  '/email-config',
  authenticate,
  tenantGuard,
  authorize('SUPER_ADMIN', 'ADMIN'),
  // ABAC : config email (credentials) = system.config.
  requirePermission('system.config'),
  async (req, res, next) => {
    try {
      const orgId = getOrgId(req);
      const parsed = emailConfigSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ success: false, message: 'Payload invalide', issues: parsed.error.issues });
      }

      // Merge with existing config so partial updates don't wipe credentials.
      const existing = (await prisma.organization.findUnique({
        where: { id: orgId },
        select: { emailConfig: true },
      })) as { emailConfig: EmailConfig | null } | null;

      const merged: EmailConfig = {
        provider: 'shared',
        ...(existing?.emailConfig ?? {}),
        ...parsed.data,
        credentials: {
          ...(existing?.emailConfig?.credentials ?? {}),
          ...(parsed.data.credentials ?? {}),
        },
      };

      const updated = await prisma.organization.update({
        where: { id: orgId },
        data: { emailConfig: merged } as any,
        select: { id: true, emailConfig: true },
      });

      res.json({
        success: true,
        data: {
          id: updated.id,
          emailConfig: publicEmailConfig((updated as any).emailConfig as EmailConfig | null),
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/tenant-meta/email-config/verify
 * AUTH admin. Demarre ou rejoue la verification DKIM/SPF du domaine d'envoi.
 * Necessite provider=resend pour l'instant.
 */
router.post(
  '/email-config/verify',
  authenticate,
  tenantGuard,
  authorize('SUPER_ADMIN', 'ADMIN'),
  requirePermission('system.config'),
  async (req, res, next) => {
    try {
      const orgId = getOrgId(req);
      const org = (await prisma.organization.findUnique({
        where: { id: orgId },
        select: { emailConfig: true },
      })) as { emailConfig: EmailConfig | null } | null;

      const senderEmail = org?.emailConfig?.senderEmail;
      if (!senderEmail) {
        return res
          .status(400)
          .json({ success: false, message: 'Configurez senderEmail avant de verifier.' });
      }
      const domain = senderEmail.split('@')[1];
      if (!domain) {
        return res.status(400).json({ success: false, message: 'senderEmail malforme.' });
      }

      const outcome = await tenantEmailDispatcher.registerOrVerifyDomain(orgId, domain);

      const updated: EmailConfig = {
        ...(org?.emailConfig ?? { provider: 'shared' }),
        dkimStatus: outcome.status,
        dnsRecords: outcome.dnsRecords,
        verifiedAt: outcome.status === 'verified' ? new Date().toISOString() : org?.emailConfig?.verifiedAt,
      };

      await prisma.organization.update({
        where: { id: orgId },
        data: { emailConfig: updated } as any,
      });

      res.json({
        success: true,
        data: {
          status: outcome.status,
          dnsRecords: outcome.dnsRecords,
          message: outcome.message,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /api/v1/tenant-meta/mobile-app-config
 * AUTH admin. Met a jour la config white-label de l'app mobile (nom, icone, ...).
 * Le mode 'white_label' declenche un build dedie (a cabler dans la CI quand
 * l'infrastructure EAS sera prete - cf. notes mobile dans /docs).
 */
router.patch(
  '/mobile-app-config',
  authenticate,
  tenantGuard,
  authorize('SUPER_ADMIN', 'ADMIN'),
  // ABAC : white-label app mobile = branding.manage.
  requirePermission('branding.manage'),
  async (req, res, next) => {
    try {
      const orgId = getOrgId(req);
      const parsed = mobileAppConfigSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ success: false, message: 'Payload invalide', issues: parsed.error.issues });
      }

      const existing = (await prisma.organization.findUnique({
        where: { id: orgId },
        select: { mobileAppConfig: true },
      })) as { mobileAppConfig: MobileAppConfig | null } | null;

      const merged: MobileAppConfig = {
        mode: 'shared',
        appName: 'OptiPack',
        buildStatus: 'idle',
        ...(existing?.mobileAppConfig ?? {}),
        ...parsed.data,
      };

      const updated = await prisma.organization.update({
        where: { id: orgId },
        data: { mobileAppConfig: merged } as any,
        select: { id: true, mobileAppConfig: true },
      });

      res.json({
        success: true,
        data: {
          id: updated.id,
          mobileAppConfig: (updated as any).mobileAppConfig as MobileAppConfig,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
