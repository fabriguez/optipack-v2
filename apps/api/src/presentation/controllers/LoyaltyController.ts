import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import { LOYALTY_REPOSITORY } from '../../application/interfaces/ILoyaltyRepository';
import {
  ListLoyaltyTierConfigsUseCase,
  UpsertLoyaltyTierConfigsUseCase,
  DeleteLoyaltyTierConfigUseCase,
} from '../../application/use-cases/loyalty/LoyaltyTierConfigUseCases';

export class LoyaltyController {
  static async getByClient(req: Request, res: Response, next: NextFunction) {
    try {
      const repo = container.resolve<any>(LOYALTY_REPOSITORY);
      const result = await repo.findByClient(req.params.clientId, req.query);
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  static async getPoints(req: Request, res: Response, next: NextFunction) {
    try {
      const repo = container.resolve<any>(LOYALTY_REPOSITORY);
      const points = await repo.sumPointsByClient(req.params.clientId);
      res.json({ success: true, data: { clientId: req.params.clientId, points } });
    } catch (err) {
      next(err);
    }
  }

  // ----- Configuration des tiers de fidelite (admin) -----

  static async listTiers(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(ListLoyaltyTierConfigsUseCase);
      const items = await useCase.execute(req.user!.organizationId);
      res.json({ success: true, data: items });
    } catch (err) {
      next(err);
    }
  }

  static async upsertTiers(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(UpsertLoyaltyTierConfigsUseCase);
      const items = await useCase.execute({
        organizationId: req.user!.organizationId,
        tiers: Array.isArray(req.body?.tiers) ? req.body.tiers : [],
      });
      res.json({ success: true, data: items });
    } catch (err) {
      next(err);
    }
  }

  static async deleteTier(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(DeleteLoyaltyTierConfigUseCase);
      await useCase.execute(req.params.id, req.user!.organizationId);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  }
}
