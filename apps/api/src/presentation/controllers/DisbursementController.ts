import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import { CreateDisbursementUseCase } from '../../application/use-cases/disbursement/CreateDisbursementUseCase';
import { VoidDisbursementUseCase } from '../../application/use-cases/disbursement/VoidDisbursementUseCase';
import { DISBURSEMENT_REPOSITORY } from '../../application/interfaces/IDisbursementRepository';
import { NotFoundError } from '../../domain/errors/BusinessError';
import { disbursementScope, scopeCtx } from '../../application/services/scope/agencyScope';

export class DisbursementController {
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(CreateDisbursementUseCase);
      const result = await useCase.execute(req.body, req.user!.userId);
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const repo = container.resolve<any>(DISBURSEMENT_REPOSITORY);
      const q = req.query as Record<string, string | undefined>;
      const scopeWhere = disbursementScope.where(scopeCtx(req)) ?? null;
      const result = await repo.findAll(
        {
          agencyIds: req.user!.agencyIds,
          scopeWhere,
          agencyId: q.agencyId,
          ordererUserId: q.ordererUserId,
          dateFrom: q.dateFrom,
          dateTo: q.dateTo,
          containerId: q.containerId,
          parcelId: q.parcelId,
          clientId: q.clientId,
        },
        req.query,
      );
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      await disbursementScope.assert(req.params.id, scopeCtx(req));
      const repo = container.resolve<any>(DISBURSEMENT_REPOSITORY);
      const item = await repo.findById(req.params.id);
      if (!item) throw new NotFoundError('Bon de decaissement', req.params.id);
      res.json({ success: true, data: item });
    } catch (err) {
      next(err);
    }
  }

  static async void(req: Request, res: Response, next: NextFunction) {
    try {
      await disbursementScope.assert(req.params.id, scopeCtx(req));
      const useCase = container.resolve(VoidDisbursementUseCase);
      const result = await useCase.execute(req.params.id, req.body.reason, req.user!.userId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
}
