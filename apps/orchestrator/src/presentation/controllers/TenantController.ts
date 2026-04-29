import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import {
  TenantUseCases,
  createTenantSchema,
  updateTenantSchema,
} from '../../application/use-cases/tenant/TenantUseCases';
import { AuditLogger } from '../../application/services/AuditLogger';

export class TenantController {
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = createTenantSchema.parse(req.body);
      const tenant = await container.resolve(TenantUseCases).create(parsed);
      await container.resolve(AuditLogger).log(req, {
        action: 'TENANT_CREATED',
        entityType: 'Tenant',
        entityId: tenant.id,
        payload: { slug: tenant.slug, vpsId: tenant.vpsId, ownerEmail: tenant.ownerEmail },
      });
      res.status(201).json({ success: true, data: tenant });
    } catch (err) {
      next(err);
    }
  }

  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const items = await container.resolve(TenantUseCases).list({
        status: req.query.status as string | undefined,
        vpsId: req.query.vpsId as string | undefined,
      });
      res.json({ success: true, data: items });
    } catch (err) {
      next(err);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const tenant = await container.resolve(TenantUseCases).getById(req.params.id);
      res.json({ success: true, data: tenant });
    } catch (err) {
      next(err);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = updateTenantSchema.parse(req.body);
      const tenant = await container.resolve(TenantUseCases).update(req.params.id, parsed);
      await container.resolve(AuditLogger).log(req, {
        action: 'TENANT_UPDATED',
        entityType: 'Tenant',
        entityId: req.params.id,
        payload: parsed as Record<string, unknown>,
      });
      res.json({ success: true, data: tenant });
    } catch (err) {
      next(err);
    }
  }

  static async freeze(req: Request, res: Response, next: NextFunction) {
    try {
      const tenant = await container.resolve(TenantUseCases).freeze(req.params.id);
      await container.resolve(AuditLogger).log(req, {
        action: 'TENANT_FREEZED',
        entityType: 'Tenant',
        entityId: req.params.id,
      });
      res.json({ success: true, data: tenant });
    } catch (err) {
      next(err);
    }
  }

  static async unfreeze(req: Request, res: Response, next: NextFunction) {
    try {
      const tenant = await container.resolve(TenantUseCases).unfreeze(req.params.id);
      await container.resolve(AuditLogger).log(req, {
        action: 'TENANT_UNFREEZED',
        entityType: 'Tenant',
        entityId: req.params.id,
      });
      res.json({ success: true, data: tenant });
    } catch (err) {
      next(err);
    }
  }

  static async archive(req: Request, res: Response, next: NextFunction) {
    try {
      const tenant = await container.resolve(TenantUseCases).archive(req.params.id);
      await container.resolve(AuditLogger).log(req, {
        action: 'TENANT_ARCHIVED',
        entityType: 'Tenant',
        entityId: req.params.id,
      });
      res.json({ success: true, data: tenant });
    } catch (err) {
      next(err);
    }
  }

  static async migrate(req: Request, res: Response, next: NextFunction) {
    try {
      const targetVpsId = req.body?.targetVpsId as string | undefined;
      if (!targetVpsId) {
        res.status(400).json({ success: false, message: 'targetVpsId requis' });
        return;
      }
      const tenant = await container.resolve(TenantUseCases).migrate(req.params.id, targetVpsId);
      await container.resolve(AuditLogger).log(req, {
        action: 'TENANT_MIGRATE_REQUESTED',
        entityType: 'Tenant',
        entityId: req.params.id,
        payload: { targetVpsId },
      });
      res.json({ success: true, data: tenant });
    } catch (err) {
      next(err);
    }
  }

  static async listJobs(req: Request, res: Response, next: NextFunction) {
    try {
      const limit = req.query.limit ? Number(req.query.limit) : 50;
      const items = await container.resolve(TenantUseCases).listJobs(req.params.id, limit);
      res.json({ success: true, data: items });
    } catch (err) {
      next(err);
    }
  }

  static async getLogs(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await container.resolve(TenantUseCases).getLogs(req.params.id, {
        tail: req.query.tail ? Number(req.query.tail) : 200,
        service: (req.query.service as 'api' | 'web' | undefined) ?? 'api',
      });
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
}
