import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import { CalculatePenaltiesUseCase } from '../../application/use-cases/penalty/CalculatePenaltiesUseCase';
import { PENALTY_REPOSITORY } from '../../application/interfaces/IPenaltyRepository';
import { NotFoundError } from '../../domain/errors/BusinessError';

export class PenaltyController {
  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const repo = container.resolve<any>(PENALTY_REPOSITORY);
      const { agencyId, clientId, isPaid } = req.query;
      const result = await repo.findAll(
        { agencyId: agencyId as string, clientId: clientId as string, isPaid: isPaid === 'true' },
        req.query,
      );
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const repo = container.resolve<any>(PENALTY_REPOSITORY);
      const penalty = await repo.findById(req.params.id);
      if (!penalty) throw new NotFoundError('Penalite', req.params.id);
      res.json({ success: true, data: penalty });
    } catch (err) {
      next(err);
    }
  }

  static async calculate(_req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(CalculatePenaltiesUseCase);
      const result = await useCase.execute();
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
}
