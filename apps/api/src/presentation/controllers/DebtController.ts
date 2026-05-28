import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import { CreateDebtUseCase } from '../../application/use-cases/debt/CreateDebtUseCase';
import { RecordDebtPaymentUseCase } from '../../application/use-cases/debt/RecordDebtPaymentUseCase';
import { VoidDebtUseCase } from '../../application/use-cases/debt/VoidDebtUseCase';
import { AdjustDebtUseCase } from '../../application/use-cases/debt/AdjustDebtUseCase';
import { MarkDebtLitigatedUseCase } from '../../application/use-cases/debt/MarkDebtLitigatedUseCase';
import { DEBT_REPOSITORY } from '../../application/interfaces/IDebtRepository';
import { NotFoundError } from '../../domain/errors/BusinessError';

export class DebtController {
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(CreateDebtUseCase);
      const result = await useCase.execute(req.body, req.user!.userId);
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const repo = container.resolve<any>(DEBT_REPOSITORY);
      const { clientId, employeeId, carrierId, agencyId, type, status, bucket, category, priority, timeFilter } = req.query;
      const result = await repo.findAll(
        {
          clientId: clientId as string | undefined,
          employeeId: employeeId as string | undefined,
          carrierId: carrierId as string | undefined,
          agencyId: agencyId as string | undefined,
          type: type as string | undefined,
          status: status as string | undefined,
          category: category as string | undefined,
          priority: priority as string | undefined,
          timeFilter: timeFilter as 'overdue' | 'due_today' | 'open' | undefined,
          bucket: bucket as 'client' | 'company' | undefined,
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

  static async recordPayment(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(RecordDebtPaymentUseCase);
      const result = await useCase.execute(req.params.id, req.body, req.user!.userId);
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async voidDebt(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(VoidDebtUseCase);
      const result = await useCase.execute(req.params.id, req.body, req.user!.userId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async adjust(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(AdjustDebtUseCase);
      const result = await useCase.execute(req.params.id, req.body, req.user!.userId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async markLitigated(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(MarkDebtLitigatedUseCase);
      const result = await useCase.execute(req.params.id, req.body, req.user!.userId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
}
