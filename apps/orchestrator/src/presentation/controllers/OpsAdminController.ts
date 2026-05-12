import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import {
  OpsAdminUseCases,
  inviteOpsAdminSchema,
  updateOpsAdminSchema,
} from '../../application/use-cases/ops-admin/OpsAdminUseCases';
import { AuditLogger } from '../../application/services/AuditLogger';
import { AuthenticationError } from '../../domain/errors/BusinessError';
import { parsePagination, paginated } from '../../application/utils/pagination';

export class OpsAdminController {
  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const p = parsePagination(req);
      const { items, total } = await container.resolve(OpsAdminUseCases).list({
        q: p.q,
        page: p.page,
        pageSize: p.pageSize,
      });
      res.json({ success: true, ...paginated(items, total, p.page, p.pageSize) });
    } catch (err) {
      next(err);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const item = await container.resolve(OpsAdminUseCases).getById(req.params.id);
      res.json({ success: true, data: item });
    } catch (err) {
      next(err);
    }
  }

  static async invite(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = inviteOpsAdminSchema.parse(req.body);
      const result = await container.resolve(OpsAdminUseCases).invite(parsed);
      await container.resolve(AuditLogger).log(req, {
        action: 'OPS_ADMIN_INVITED',
        entityType: 'OpsAdmin',
        entityId: result.id,
        payload: { email: result.email, isSuperAdmin: result.isSuperAdmin },
      });
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = updateOpsAdminSchema.parse(req.body);
      if (!req.opsAdmin) throw new AuthenticationError();
      const result = await container
        .resolve(OpsAdminUseCases)
        .update(req.params.id, parsed, req.opsAdmin.sub);
      await container.resolve(AuditLogger).log(req, {
        action: 'OPS_ADMIN_UPDATED',
        entityType: 'OpsAdmin',
        entityId: req.params.id,
        payload: parsed as Record<string, unknown>,
      });
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async reset2FA(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.opsAdmin) throw new AuthenticationError();
      await container.resolve(OpsAdminUseCases).reset2FA(req.params.id, req.opsAdmin.sub);
      await container.resolve(AuditLogger).log(req, {
        action: 'OPS_ADMIN_2FA_RESET',
        entityType: 'OpsAdmin',
        entityId: req.params.id,
      });
      res.json({ success: true, message: '2FA reset. Le compte concerne devra reconfigurer son TOTP au prochain login.' });
    } catch (err) {
      next(err);
    }
  }
}
