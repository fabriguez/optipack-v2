import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import { CalculatePenaltiesUseCase } from '../../application/use-cases/penalty/CalculatePenaltiesUseCase';
import { PENALTY_REPOSITORY } from '../../application/interfaces/IPenaltyRepository';
import { NotFoundError } from '../../domain/errors/BusinessError';
import { penaltyScope, scopeCtx } from '../../application/services/scope/agencyScope';

export class PenaltyController {
  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const repo = container.resolve<any>(PENALTY_REPOSITORY);
      const { agencyId, clientId, isPaid } = req.query;
      // Scope agence (etape 2) : fragment merge en AND dans le where du repo.
      const scopeWhere = penaltyScope.where(scopeCtx(req)) ?? null;
      const result = await repo.findAll(
        { agencyId: agencyId as string, clientId: clientId as string, isPaid: isPaid === 'true', scopeWhere },
        req.query,
      );
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      await penaltyScope.assert(req.params.id, scopeCtx(req));
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
