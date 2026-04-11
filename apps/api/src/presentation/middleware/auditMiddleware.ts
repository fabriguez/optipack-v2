import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import { AUDIT_LOG_REPOSITORY, type IAuditLogRepository } from '../../application/interfaces/IAuditLogRepository';
import { createChildLogger } from '../../config/logger';

const logger = createChildLogger('Audit');

const AUDITED_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

export function auditMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!AUDITED_METHODS.includes(req.method)) {
    return next();
  }

  const originalJson = res.json.bind(res);

  res.json = function (body: any) {
    // Log after response is sent
    if (res.statusCode < 400 && req.user) {
      const entityType = extractEntityType(req.originalUrl);
      const action = methodToAction(req.method);

      try {
        const auditRepo = container.resolve<IAuditLogRepository>(AUDIT_LOG_REPOSITORY);
        auditRepo
          .create({
            action,
            entityType,
            entityId: req.params?.id || body?.data?.id || null,
            changes: { body: sanitizeBody(req.body) },
            ipAddress: req.ip || req.socket.remoteAddress || null,
            userAgent: req.headers['user-agent'] || null,
            user: { connect: { id: req.user.userId } },
            ...(req.user.agencyIds?.[0] && {
              agency: { connect: { id: req.user.agencyIds[0] } },
            }),
          })
          .catch((err) => logger.error({ err }, 'Failed to create audit log'));
      } catch {
        // Audit should never break the request
      }
    }

    return originalJson(body);
  };

  next();
}

function extractEntityType(url: string): string {
  const parts = url.replace('/api/v1/', '').split('/');
  return parts[0] || 'unknown';
}

function methodToAction(method: string): string {
  switch (method) {
    case 'POST':
      return 'CREATE';
    case 'PUT':
    case 'PATCH':
      return 'UPDATE';
    case 'DELETE':
      return 'DELETE';
    default:
      return method;
  }
}

function sanitizeBody(body: any): any {
  if (!body) return {};
  const sanitized = { ...body };
  delete sanitized.password;
  delete sanitized.confirmPassword;
  delete sanitized.passwordHash;
  delete sanitized.token;
  return sanitized;
}
