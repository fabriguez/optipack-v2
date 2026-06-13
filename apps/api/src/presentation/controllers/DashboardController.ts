import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import { GetDashboardStatsUseCase } from '../../application/use-cases/dashboard/GetDashboardStatsUseCase';
import { scopeCtx } from '../../application/services/scope/agencyScope';

export class DashboardController {
  static async getStats(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(GetDashboardStatsUseCase);
      // Scoping agence applique au niveau du use case (toutes les stats).
      const stats = await useCase.execute(scopeCtx(req));
      res.json({ success: true, data: stats });
    } catch (err) {
      next(err);
    }
  }
}
