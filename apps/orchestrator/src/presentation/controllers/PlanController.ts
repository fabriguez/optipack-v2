import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import {
  ResourcePlanUseCases,
  createPlanSchema,
  updatePlanSchema,
} from '../../application/use-cases/plan/ResourcePlanUseCases';
import { AuditLogger } from '../../application/services/AuditLogger';

export class PlanController {
  /** Public-ish : tous les ops admins peuvent lister, et les tenants verront aussi via leur API. */
  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const items = await container.resolve(ResourcePlanUseCases).list({
        isPublic: req.query.public === 'true' ? true : undefined,
        isActive: req.query.active === 'false' ? false : true,
      });
      res.json({ success: true, data: items });
    } catch (err) {
      next(err);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const item = await container.resolve(ResourcePlanUseCases).getById(req.params.id);
      res.json({ success: true, data: item });
    } catch (err) {
      next(err);
    }
  }

  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = createPlanSchema.parse(req.body);
      const item = await container.resolve(ResourcePlanUseCases).create(parsed);
      await container.resolve(AuditLogger).log(req, {
        action: 'PLAN_CREATED',
        entityType: 'ResourcePlan',
        entityId: item.id,
        payload: { code: item.code, price: Number(item.pricePerMonth) },
      });
      res.status(201).json({ success: true, data: item });
    } catch (err) {
      next(err);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = updatePlanSchema.parse(req.body);
      const item = await container.resolve(ResourcePlanUseCases).update(req.params.id, parsed);
      await container.resolve(AuditLogger).log(req, {
        action: 'PLAN_UPDATED',
        entityType: 'ResourcePlan',
        entityId: req.params.id,
        payload: parsed as Record<string, unknown>,
      });
      res.json({ success: true, data: item });
    } catch (err) {
      next(err);
    }
  }

  static async deactivate(req: Request, res: Response, next: NextFunction) {
    try {
      const item = await container.resolve(ResourcePlanUseCases).deactivate(req.params.id);
      await container.resolve(AuditLogger).log(req, {
        action: 'PLAN_DEACTIVATED',
        entityType: 'ResourcePlan',
        entityId: req.params.id,
      });
      res.json({ success: true, data: item });
    } catch (err) {
      next(err);
    }
  }
}
