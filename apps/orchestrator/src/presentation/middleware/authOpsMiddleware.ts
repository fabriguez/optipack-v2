import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../../config';
import { AuthenticationError, AuthorizationError } from '../../domain/errors/BusinessError';

export interface OpsJwtPayload {
  sub: string;
  email: string;
  isSuperAdmin: boolean;
  scope: 'ops';
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      opsAdmin?: OpsJwtPayload;
    }
  }
}

export const OPS_AUTH_COOKIE = 'ops_token';

export function authenticateOps(req: Request, _res: Response, next: NextFunction): void {
  // Phase 5 #36 — accepter cookie httpOnly OU Bearer header (ce dernier conserve
  // pour les outils CLI / curl en debug ; le frontend ops-admin passe en cookie).
  const authHeader = req.headers.authorization;
  const fromCookie = (req as Request & { cookies?: Record<string, string> }).cookies?.[OPS_AUTH_COOKIE];
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : fromCookie ?? '';

  if (!token) {
    return next(new AuthenticationError());
  }
  try {
    const payload = jwt.verify(token, config.jwt.secret) as OpsJwtPayload;
    if (payload.scope !== 'ops') {
      return next(new AuthenticationError('Token de scope invalide'));
    }
    req.opsAdmin = payload;
    next();
  } catch {
    next(new AuthenticationError('Token invalide ou expire'));
  }
}

export function requireSuperAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.opsAdmin) return next(new AuthenticationError());
  if (!req.opsAdmin.isSuperAdmin) {
    return next(new AuthorizationError('Reserve aux super-admins'));
  }
  next();
}
