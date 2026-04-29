import type { Request, Response, NextFunction } from 'express';
import { AuthenticationError } from '../../domain/errors/BusinessError';

/**
 * Auth pour les requetes provenant de l'API d'un tenant (proxy vers l'orchestrator).
 * Le tenant API connait `OPS_TENANT_PROXY_TOKEN` (env partage entre orchestrateur et
 * chaque container API tenant ; injecte au provisioning).
 *
 * Header attendu : `X-Service-Token: <token>`
 */
export function requireServiceToken(req: Request, _res: Response, next: NextFunction): void {
  const expected = process.env.OPS_TENANT_PROXY_TOKEN;
  if (!expected) {
    return next(new AuthenticationError('Service token non configure cote orchestrateur'));
  }
  const provided = req.headers['x-service-token'];
  if (typeof provided !== 'string' || provided !== expected) {
    return next(new AuthenticationError('Service token invalide'));
  }
  next();
}
