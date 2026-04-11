import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../../config';
import { AuthenticationError, AuthorizationError } from '../../domain/errors/BusinessError';
import type { JwtPayload } from '@optipack/shared';

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
