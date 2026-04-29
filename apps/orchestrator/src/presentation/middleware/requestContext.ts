import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { logger } from '../../infrastructure/logger';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

/**
 * Injecte un request-id (X-Request-Id si fourni, sinon genere) et logge
 * chaque requete avec sa duree.
 */
export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers['x-request-id'];
  req.requestId = (typeof incoming === 'string' && incoming) || randomUUID();
  res.setHeader('X-Request-Id', req.requestId);

  const startedAt = Date.now();
  res.on('finish', () => {
    logger.info(
      {
        reqId: req.requestId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        ms: Date.now() - startedAt,
        ip: req.ip,
        opsAdmin: req.opsAdmin?.email,
      },
      'request',
    );
  });

  next();
}
