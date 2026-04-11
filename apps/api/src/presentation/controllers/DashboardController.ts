import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import { GetDashboardStatsUseCase } from '../../application/use-cases/dashboard/GetDashboardStatsUseCase';

export class DashboardController {
  static async getStats(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(GetDashboardStatsUseCase);
      const stats = await useCase.execute(req.user!.agencyIds);
      res.json({ success: true, data: stats });
    } catch (err) {
      next(err);
    }
  }
}
