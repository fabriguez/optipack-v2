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

export function authenticateOps(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return next(new AuthenticationError());
  }

  const token = authHeader.slice(7);
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
