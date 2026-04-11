import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import { CreateDebtUseCase } from '../../application/use-cases/debt/CreateDebtUseCase';
import { DEBT_REPOSITORY } from '../../application/interfaces/IDebtRepository';
import { NotFoundError } from '../../domain/errors/BusinessError';

export class DebtController {
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(CreateDebtUseCase);
      const result = await useCase.execute(req.body);
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const repo = container.resolve<any>(DEBT_REPOSITORY);
      const { clientId, status } = req.query;
      const result = await repo.findAll(
        { clientId: clientId as string, status: status as string },
        req.query,
      );
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const repo = container.resolve<any>(DEBT_REPOSITORY);
      const item = await repo.findById(req.params.id);
      if (!item) throw new NotFoundError('Dette', req.params.id);
      res.json({ success: true, data: item });
    } catch (err) {
      next(err);
    }
  }

  static async getByClient(req: Request, res: Response, next: NextFunction) {
    try {
      const repo = container.resolve<any>(DEBT_REPOSITORY);
      const debts = await repo.findByClient(req.params.clientId);
      res.json({ success: true, data: debts });
    } catch (err) {
      next(err);
    }
  }
}
