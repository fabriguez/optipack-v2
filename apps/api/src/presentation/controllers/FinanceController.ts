import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import {
  FinanceTimelineUseCase,
  type FinanceEventType,
} from '../../application/use-cases/finance/FinanceTimelineUseCase';
import {
  debtPaymentScope,
  debtScope,
  expenseScope,
  fundTransferScope,
  scopeCtx,
} from '../../application/services/scope/agencyScope';

const ALL_TYPES: FinanceEventType[] = [
  'SALARY_PAYMENT',
  'CHARGE_PAYMENT',
  'FUND_TRANSFER',
  'DEBT_CREATED',
  'DEBT_PAYMENT',
];

function parseTypes(raw: unknown): FinanceEventType[] | undefined {
  if (!raw) return undefined;
  const list = Array.isArray(raw) ? raw : String(raw).split(',');
  const valid = list
    .map((s) => String(s).trim().toUpperCase() as FinanceEventType)
    .filter((s) => (ALL_TYPES as string[]).includes(s));
  return valid.length ? valid : undefined;
}

export class FinanceController {
  static async timeline(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(FinanceTimelineUseCase);
      // Scope agence (etape 2) : fragments merges en AND par table.
      const ctx = scopeCtx(req);
      const result = await useCase.execute({
        agencyIds: req.user!.agencyIds,
        agencyId: req.query.agencyId ? String(req.query.agencyId) : undefined,
        types: parseTypes(req.query.types),
        from: req.query.from ? String(req.query.from) : undefined,
        to: req.query.to ? String(req.query.to) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        scope: {
          expense: expenseScope.where(ctx),
          fundTransfer: fundTransferScope.where(ctx),
          debt: debtScope.where(ctx),
          debtPayment: debtPaymentScope.where(ctx),
        },
      });
      res.json({ success: true, data: result.events, meta: { total: result.total } });
    } catch (err) {
      next(err);
    }
  }
}
