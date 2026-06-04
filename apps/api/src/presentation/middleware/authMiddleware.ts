import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../../config';
import { AuthenticationError, AuthorizationError } from '../../domain/errors/BusinessError';
import type { JwtPayload } from '@transitsoftservices/shared';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return next(new AuthenticationError());
  }

  const token = authHeader.substring(7);

  try {
    const payload = jwt.verify(token, config.jwt.secret) as JwtPayload;
    req.user = payload;
    next();
  } catch (err) {
    // Log detaille pour diagnostiquer "Token invalide ou expire" cote serveur.
    // Permet de distinguer signature invalide (mismatch JWT_SECRET entre instances),
    // token expire (clock skew), ou token malforme.
    const e = err as { name?: string; message?: string; expiredAt?: Date };
    const decoded = jwt.decode(token) as { exp?: number; iat?: number; userId?: string } | null;
    const now = Math.floor(Date.now() / 1000);
    const tokenSuffix = token.slice(-12);
    // eslint-disable-next-line no-console
    console.warn(
      `[auth.verify-fail] err=${e?.name ?? 'Unknown'} msg=${e?.message ?? '-'} ` +
        `tokenSuffix=${tokenSuffix} ` +
        `decoded.exp=${decoded?.exp ?? '-'} decoded.iat=${decoded?.iat ?? '-'} ` +
        `now=${now} skew=${decoded?.exp ? decoded.exp - now : '-'}s ` +
        `user=${decoded?.userId ?? '-'} url=${req.method} ${req.originalUrl}`,
    );
    next(new AuthenticationError('Token invalide ou expire'));
  }
}

/**
 * Authentifie un token STAFF *ou* CLIENT-PORTAL (meme secret JWT). Sert aux
 * routes en lecture partagees entre le back-office et le portail client mobile,
 * typiquement la lecture des objets uploades (`GET /uploads/object/*`) : les
 * deux portails utilisent AuthedImage (fetch + Bearer), mais le token client n'a
 * ni role ni organizationId. On peuple `req.user` pour un staff, `req.clientPortal`
 * pour un client. Ne PAS utiliser sur des routes d'ecriture / sensibles.
 */
export function authenticateUserOrClient(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return next(new AuthenticationError());
  }
  const token = authHeader.substring(7);
  try {
    const payload = jwt.verify(token, config.jwt.secret) as JwtPayload & { type?: string };
    if (payload?.type === 'client') {
      // Token portail client : pas de role/org, on l'expose via req.clientPortal.
      (req as { clientPortal?: unknown }).clientPortal = payload;
    } else {
      req.user = payload;
    }
    next();
  } catch {
    next(new AuthenticationError('Token invalide ou expire'));
  }
}

export function authorize(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AuthenticationError());
    }

    if (roles.length > 0 && !roles.includes(req.user.role)) {
      return next(new AuthorizationError('Role insuffisant pour cette action'));
    }

    next();
  };
}

/**
 * Phase 1 ABAC : verifie que l'utilisateur dispose d'au moins une des permissions
 * demandees. SUPER_ADMIN bypass. Les permissions sont posees dans le JWT au login.
 *
 * Co-existe avec authorize() (legacy role-based) le temps de la migration des
 * routes vers ABAC.
 */
export function requirePermission(...keys: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(new AuthenticationError());
    if (req.user.role === 'SUPER_ADMIN') return next();

    const perms = req.user.permissions ?? [];
    if (perms.includes('*')) return next();
    if (keys.length === 0) return next();
    if (keys.some((k) => perms.includes(k))) return next();

    return next(new AuthorizationError('Permission insuffisante pour cette action'));
  };
}

export function requireAgency(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    return next(new AuthenticationError());
  }

  const agencyId = req.params.agencyId || req.body?.agencyId || req.query.agencyId;

  if (agencyId && !req.user.agencyIds.includes(agencyId) && req.user.role !== 'SUPER_ADMIN') {
    return next(new AuthorizationError("Acces non autorise a cette agence"));
  }

  next();
}
