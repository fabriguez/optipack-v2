import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import { CreateExpenseUseCase } from '../../application/use-cases/expense/CreateExpenseUseCase';
import { CreateContainerExpenseUseCase } from '../../application/use-cases/expense/CreateContainerExpenseUseCase';
import { PayExpenseFromCashRegisterUseCase } from '../../application/use-cases/expense/PayExpenseFromCashRegisterUseCase';
import { EXPENSE_REPOSITORY } from '../../application/interfaces/IExpenseRepository';
import { NotFoundError } from '../../domain/errors/BusinessError';
import { prisma } from '../../config/database';

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

  // ----- Container expenses -----

  static async listForContainer(req: Request, res: Response, next: NextFunction) {
    try {
      const items = await prisma.expense.findMany({
        where: { containerId: req.params.containerId },
        orderBy: { createdAt: 'desc' },
        include: {
          cashRegister: { select: { id: true, date: true } },
          paidBy: { select: { id: true, firstName: true, lastName: true } },
          approvedBy: { select: { id: true, firstName: true, lastName: true } },
        },
      });
      res.json({ success: true, data: items });
    } catch (err) {
      next(err);
    }
  }

  static async createForContainer(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(CreateContainerExpenseUseCase);
      const result = await useCase.execute(
        { ...req.body, containerId: req.params.containerId },
        req.user!.userId,
      );
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async pay(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(PayExpenseFromCashRegisterUseCase);
      const result = await useCase.execute(
        { expenseId: req.params.id, cashRegisterId: req.body?.cashRegisterId, note: req.body?.note },
        req.user!.userId,
      );
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
}
