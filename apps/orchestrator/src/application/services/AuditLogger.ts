import { injectable } from 'tsyringe';
import type { Request } from 'express';
import { prisma } from '../../config/database';

/**
 * Service centralise pour ecrire dans `audit_logs`.
 * Toute action ops sensible DOIT passer par ici (pour la tracabilite + investigations).
 */

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string | null;
  payload?: Record<string, unknown> | null;
}

@injectable()
export class AuditLogger {
  /**
   * Log une action depuis un controller. Le opsAdminId, IP et UA sont extraits de `req`.
   */
  async log(req: Request, entry: AuditEntry): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          opsAdminId: req.opsAdmin?.sub ?? null,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId ?? null,
          payload: (entry.payload as never) ?? undefined,
          ipAddress: this.extractIp(req),
          userAgent: req.headers['user-agent']?.toString().slice(0, 500) ?? null,
        },
      });
    } catch (e: unknown) {
      // Audit log failure ne doit pas casser l'action principale.
      // eslint-disable-next-line no-console
      console.error('[audit] failed to write log', e);
    }
  }

  private extractIp(req: Request): string | null {
    const fwd = req.headers['x-forwarded-for'];
    if (typeof fwd === 'string') return fwd.split(',')[0].trim();
    return req.ip ?? req.socket.remoteAddress ?? null;
  }

  async list(filters: {
    opsAdminId?: string;
    entityType?: string;
    entityId?: string;
    action?: string;
    limit?: number;
    cursor?: string;
  }) {
    const limit = Math.min(filters.limit ?? 50, 200);
    return prisma.auditLog.findMany({
      where: {
        ...(filters.opsAdminId && { opsAdminId: filters.opsAdminId }),
        ...(filters.entityType && { entityType: filters.entityType }),
        ...(filters.entityId && { entityId: filters.entityId }),
        ...(filters.action && { action: { contains: filters.action, mode: 'insensitive' } }),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(filters.cursor && { cursor: { id: filters.cursor }, skip: 1 }),
      include: {
        opsAdmin: { select: { id: true, email: true, fullName: true } },
      },
    });
  }
}
