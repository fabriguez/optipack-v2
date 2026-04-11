import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import { LOYALTY_REPOSITORY } from '../../application/interfaces/ILoyaltyRepository';

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
}
