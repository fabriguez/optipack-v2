import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import { CreateDebtUseCase } from '../../application/use-cases/debt/CreateDebtUseCase';
import { RecordDebtPaymentUseCase } from '../../application/use-cases/debt/RecordDebtPaymentUseCase';
import { VoidDebtUseCase } from '../../application/use-cases/debt/VoidDebtUseCase';
import { AdjustDebtUseCase } from '../../application/use-cases/debt/AdjustDebtUseCase';
import { MarkDebtLitigatedUseCase } from '../../application/use-cases/debt/MarkDebtLitigatedUseCase';
import { DEBT_REPOSITORY } from '../../application/interfaces/IDebtRepository';
import { NotFoundError } from '../../domain/errors/BusinessError';
import { assertAgencyInScope, clientScope, debtScope, scopeCtx } from '../../application/services/scope/agencyScope';
import { applyFieldPolicy, DEBT_FIELD_POLICY } from '../serializers/fieldPolicy';
import { getPolicy } from '../middleware/policyContext';
import { prisma } from '../../config/database';

export class DebtController {
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      // Garde dure : creer une dette n'est possible que pour une de SES agences
      // (agence cible dans le body). Admin => bypass (ctx.unrestricted).
      const ctx = scopeCtx(req);
      const agencyId = req.body?.agencyId as string | undefined;
      if (agencyId) assertAgencyInScope(agencyId, ctx);
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
      // Scope agence (etape 2) : fragment merge en AND dans le where du repo.
      const scopeWhere = debtScope.where(scopeCtx(req)) ?? null;
      const result = await repo.findAll(
        {
          scopeWhere,
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
      const policy = getPolicy(req);
      const masked = policy ? { ...result, data: applyFieldPolicy(result.data, DEBT_FIELD_POLICY, policy) } : result;
      res.json({ success: true, ...masked });
    } catch (err) {
      next(err);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      await debtScope.assert(req.params.id, scopeCtx(req));
      const repo = container.resolve<any>(DEBT_REPOSITORY);
      const item = await repo.findById(req.params.id);
      if (!item) throw new NotFoundError('Dette', req.params.id);
      const policy = getPolicy(req);
      res.json({ success: true, data: policy ? applyFieldPolicy(item, DEBT_FIELD_POLICY, policy) : item });
    } catch (err) {
      next(err);
    }
  }

  static async getByClient(req: Request, res: Response, next: NextFunction) {
    try {
      await clientScope.assert(req.params.clientId, scopeCtx(req));
      const repo = container.resolve<any>(DEBT_REPOSITORY);
      const debts = await repo.findByClient(req.params.clientId);
      const policy = getPolicy(req);
      res.json({ success: true, data: policy ? applyFieldPolicy(debts, DEBT_FIELD_POLICY, policy) : debts });
    } catch (err) {
      next(err);
    }
  }

  static async recordPayment(req: Request, res: Response, next: NextFunction) {
    try {
      const ctx = scopeCtx(req);
      await debtScope.assert(req.params.id, ctx);
      // Garde dure : encaisser un paiement de dette n'est possible que pour une
      // de SES agences. L'agence est portee par la dette (chargement minimal).
      const debt = await prisma.debt.findUnique({
        where: { id: req.params.id },
        select: { agencyId: true },
      });
      if (debt) assertAgencyInScope(debt.agencyId, ctx);
      const useCase = container.resolve(RecordDebtPaymentUseCase);
      const result = await useCase.execute(req.params.id, req.body, req.user!.userId);
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async voidDebt(req: Request, res: Response, next: NextFunction) {
    try {
      await debtScope.assert(req.params.id, scopeCtx(req));
      const useCase = container.resolve(VoidDebtUseCase);
      const result = await useCase.execute(req.params.id, req.body, req.user!.userId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async adjust(req: Request, res: Response, next: NextFunction) {
    try {
      await debtScope.assert(req.params.id, scopeCtx(req));
      const useCase = container.resolve(AdjustDebtUseCase);
      const result = await useCase.execute(req.params.id, req.body, req.user!.userId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async markLitigated(req: Request, res: Response, next: NextFunction) {
    try {
      await debtScope.assert(req.params.id, scopeCtx(req));
      const useCase = container.resolve(MarkDebtLitigatedUseCase);
      const result = await useCase.execute(req.params.id, req.body, req.user!.userId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
}
