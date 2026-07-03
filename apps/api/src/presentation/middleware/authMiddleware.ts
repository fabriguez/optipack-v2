import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../../config';
import { AuthenticationError, AuthorizationError } from '../../domain/errors/BusinessError';
import type { JwtPayload } from '@transitsoftservices/shared';
import { getPolicy } from './policyContext';
import { fetchPermissionVersion } from '../../application/services/pvCache';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return next(new AuthenticationError());
  }

  const token = authHeader.substring(7);

  try {
    const payload = jwt.verify(token, config.jwt.secret, { algorithms: ['HS256'] }) as JwtPayload;
    req.user = payload;

    // Étape 7 : rejette les tokens dont la version des permissions est perimee.
    // Un override ou un changement de poste incremente permissionVersion en DB,
    // ce qui invalide tous les JWT anterieurs de cet utilisateur.
    if (typeof payload.pv === 'number') {
      const currentPv = await fetchPermissionVersion(payload.userId);
      if (currentPv === null || currentPv !== payload.pv) {
        return next(new AuthenticationError('Permissions mises a jour, reconnexion requise'));
      }
    }

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
    const payload = jwt.verify(token, config.jwt.secret, { algorithms: ['HS256'] }) as JwtPayload & { type?: string };
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
  // Nomme pour etre detectable par le test garde-fou (route-permission-guard).
  const authorizeMiddleware = (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AuthenticationError());
    }

    if (roles.length > 0 && !roles.includes(req.user.role)) {
      return next(new AuthorizationError('Role insuffisant pour cette action'));
    }

    next();
  };
  return authorizeMiddleware;
}

/**
 * ABAC : verifie que l'utilisateur dispose d'au moins une des permissions
 * demandees. ADMIN/SUPER_ADMIN bypass. Les permissions sont posees dans le JWT
 * au login/refresh.
 *
 * Mode shadow (PERMISSIONS_ENFORCE=log, defaut) : les refus sont logges
 * `[PERM-DENY]` mais laissent passer — permet de deployer l'enforcement sur
 * toutes les routes et d'ajuster les presets de postes avant la bascule en
 * `enforce`. Cf. PERMISSIONS-PLAN.md etape 8.
 *
 * Co-existe avec authorize() (legacy role-based) le temps de la migration des
 * routes vers ABAC.
 */
export function requirePermission(...keys: string[]) {
  // Nomme pour etre detectable par le test garde-fou (route-permission-guard).
  const requirePermissionMiddleware = (req: Request, _res: Response, next: NextFunction): void => {
    const policy = getPolicy(req);
    if (!policy) return next(new AuthenticationError());
    if (policy.canAny(keys)) return next();

    if (config.permissions.enforce === 'log') {
      // eslint-disable-next-line no-console
      console.warn(
        `[PERM-DENY] user=${policy.userId} role=${policy.role} missing=[${keys.join('|')}] ` +
          `${req.method} ${req.originalUrl}`,
      );
      return next();
    }

    return next(new AuthorizationError('Permission insuffisante pour cette action'));
  };
  (requirePermissionMiddleware as { requiredPermissions?: string[] }).requiredPermissions = keys;
  return requirePermissionMiddleware;
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
