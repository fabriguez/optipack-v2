import { Router } from 'express';
import { prisma } from '../../../config/database';
import { authenticate, authorize } from '../../middleware/authMiddleware';
import { tenantGuard, getOrgId } from '../../middleware/tenantGuard';

const router = Router();

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

export default router;
