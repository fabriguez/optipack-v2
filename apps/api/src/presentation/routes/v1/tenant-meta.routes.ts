import { Router } from 'express';
import { prisma } from '../../../config/database';
import { authenticate, authorize } from '../../middleware/authMiddleware';
import { tenantGuard, getOrgId } from '../../middleware/tenantGuard';
import { isKnownSkinId, listSkins } from '@transitsoftservices/skins';
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
        logoUrl: org.logoUrl,
        primaryColor: org.primaryColor,
        secondaryColor: org.secondaryColor,
        accentColor: org.accentColor,
        modules: org.enabledModules ?? [],
        supportEmail: org.supportEmail,
        defaultCurrency: org.defaultCurrency,
        defaultLanguage: org.defaultLanguage,
        // Theme du site public (web-client). Si null, le frontend retombe
        // sur le defaut du SkinProvider.
        skin: (org as any).skinId ?? null,
        skinCustomization: (org as any).skinCustomization ?? null,
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

      const updated = await prisma.organization.update({
        where: { id: orgId },
        data: {
          ...(name !== undefined && { name }),
          ...(logoUrl !== undefined && { logoUrl }),
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
          logoUrl: updated.logoUrl,
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
 * GET /api/v1/tenant-meta/skins
 * PUBLIC : liste des peaux disponibles (catalogue) pour le Studio cote tenant.
 * Utilise le registre central de @transitsoftservices/skins, donc ajouter une
 * nouvelle peau ne requiert qu'une modif du package partage.
 */
router.get('/skins', (_req, res) => {
  res.json({ success: true, data: listSkins() });
});

/**
 * PATCH /api/v1/tenant-meta/skin
 * AUTH admin du tenant. Persiste la peau choisie + overrides depuis le Studio.
 * Le `skinId` est valide cote serveur via isKnownSkinId().
 */
router.patch(
  '/skin',
  authenticate,
  tenantGuard,
  authorize('SUPER_ADMIN', 'ADMIN'),
  async (req, res, next) => {
    try {
      const orgId = getOrgId(req);
      const body = req.body as {
        skinId?: string | null;
        skinCustomization?: unknown;
      };

      if (body.skinId && !isKnownSkinId(body.skinId)) {
        return res
          .status(400)
          .json({ success: false, message: `skinId inconnu : ${body.skinId}` });
      }

      const updated = await prisma.organization.update({
        where: { id: orgId },
        data: {
          ...(body.skinId !== undefined && { skinId: body.skinId } as any),
          ...(body.skinCustomization !== undefined && {
            skinCustomization: body.skinCustomization,
          } as any),
        },
      });

      // Broadcast realtime aux clients web/web-client : applique skin sans
      // reload. Voir handler ops-sync pour le meme pattern.
      try {
        realtimeService.toOrganization(updated.id, 'tenant:meta:updated', {
          organizationId: updated.id,
          changedFields: ['skin', 'skinCustomization'],
        });
      } catch {
        // non bloquant
      }

      res.json({
        success: true,
        data: {
          id: updated.id,
          skin: (updated as any).skinId ?? null,
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
