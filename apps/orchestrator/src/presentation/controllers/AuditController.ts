import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import { AuditLogger } from '../../application/services/AuditLogger';

export class AuditController {
  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const items = await container.resolve(AuditLogger).list({
        opsAdminId: req.query.opsAdminId as string | undefined,
        entityType: req.query.entityType as string | undefined,
        entityId: req.query.entityId as string | undefined,
        action: req.query.action as string | undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        cursor: req.query.cursor as string | undefined,
      });
      // Cursor : si on a recu limit+1 items, le dernier sert de cursor pour la prochaine page
      const limit = Math.min(Number(req.query.limit ?? 50), 200);
      const hasMore = items.length > limit;
      const data = hasMore ? items.slice(0, limit) : items;
      const nextCursor = hasMore ? items[limit - 1].id : null;
      res.json({ success: true, data, nextCursor });
    } catch (err) {
      next(err);
    }
  }
}
