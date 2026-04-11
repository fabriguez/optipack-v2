import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import { CreateExpenseUseCase } from '../../application/use-cases/expense/CreateExpenseUseCase';
import { EXPENSE_REPOSITORY } from '../../application/interfaces/IExpenseRepository';
import { NotFoundError } from '../../domain/errors/BusinessError';

export class ExpenseController {
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(CreateExpenseUseCase);
      const result = await useCase.execute(req.body, req.user!.userId);
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const repo = container.resolve<any>(EXPENSE_REPOSITORY);
      const result = await repo.findAll(
        { agencyIds: req.user!.agencyIds },
        req.query,
      );
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const repo = container.resolve<any>(EXPENSE_REPOSITORY);
      const item = await repo.findById(req.params.id);
      if (!item) throw new NotFoundError('Depense', req.params.id);
      res.json({ success: true, data: item });
    } catch (err) {
      next(err);
    }
  }
}
