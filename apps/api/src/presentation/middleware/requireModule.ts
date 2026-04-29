import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { AuthorizationError } from '../../domain/errors/BusinessError';

/**
 * Phase 0.4 — requireModule
 * Bloque l'acces a une route si le tenant courant n'a pas active le module concerne.
 *
 * Usage : `router.use('/parcels', authenticate, tenantGuard, requireModule('parcels'), ...)`
 *
 * Convention : `enabledModules = []` (vide) signifie "tous actifs" pour la backward compat
 * avec le tenant TransitSoftServices originel. Les nouveaux tenants doivent declarer
 * explicitement leur liste.
 */

// Cache pour eviter de hit la DB a chaque requete.
const cache = new Map<string, { modules: string[]; expiresAt: number }>();
const CACHE_TTL_MS = 60_000; // 1 minute

async function getEnabledModules(orgId: string): Promise<string[]> {
  const now = Date.now();
  const cached = cache.get(orgId);
  if (cached && cached.expiresAt > now) return cached.modules;

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { enabledModules: true },
  });
  const modules = org?.enabledModules ?? [];
  cache.set(orgId, { modules, expiresAt: now + CACHE_TTL_MS });
  return modules;
}

export function requireModule(moduleName: string) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const orgId = req.user?.organizationId;
      if (!orgId) return next(new AuthorizationError('organizationId manquant'));

      const enabled = await getEnabledModules(orgId);

      // Vide = tous actifs (backward compat)
      if (enabled.length === 0) return next();

      if (!enabled.includes(moduleName)) {
        return next(
          new AuthorizationError(
            `Le module "${moduleName}" n'est pas active pour votre tenant. Contactez votre administrateur.`,
          ),
        );
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Invalide le cache d'un tenant. A appeler apres modification des `enabledModules`.
 */
export function invalidateModulesCache(orgId: string) {
  cache.delete(orgId);
}
