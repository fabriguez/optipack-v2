import type { Request, Response, NextFunction } from 'express';
import { AuthenticationError } from '../../domain/errors/BusinessError';

/**
 * Phase 0.2 — tenantGuard
 * S'assure que `req.user.organizationId` est bien present avant tout acces a une route
 * de l'API tenant. Doit etre place APRES `authenticate` dans la chaine.
 *
 * Toutes les requetes Prisma DOIVENT filtrer par `req.user.organizationId` pour eviter
 * les fuites de donnees inter-tenant. Cf. helpers `prismaScoped` ci-dessous.
 */
export function tenantGuard(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    return next(new AuthenticationError());
  }
  if (!req.user.organizationId) {
    return next(new AuthenticationError("Token invalide : organizationId manquant. Reconnectez-vous."));
  }
  next();
}

/**
 * Helpers utilitaires pour scoper les requetes Prisma au tenant courant.
 * Usage : `where: { ...tenantWhere(req), ... }` dans les controllers.
 */
export function tenantWhere(req: Request): { organizationId: string } {
  if (!req.user?.organizationId) {
    throw new AuthenticationError("organizationId requis pour cette operation");
  }
  return { organizationId: req.user.organizationId };
}

export function getOrgId(req: Request): string {
  if (!req.user?.organizationId) {
    throw new AuthenticationError("organizationId requis pour cette operation");
  }
  return req.user.organizationId;
}
