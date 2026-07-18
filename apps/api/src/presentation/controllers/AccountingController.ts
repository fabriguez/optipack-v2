import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import { GetLedgerUseCase } from '../../application/use-cases/accounting/GetLedgerUseCase';
import { JOURNAL_ENTRY_REPOSITORY } from '../../application/interfaces/IJournalEntryRepository';
import { NotFoundError } from '../../domain/errors/BusinessError';
import { journalEntryScope, scopeCtx } from '../../application/services/scope/agencyScope';

export class AccountingController {
  static async getLedger(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(GetLedgerUseCase);
      const { agencyId, sourceType, dateFrom, dateTo } = req.query;
      // Scope agence (etape 2) : fragment merge en AND dans le where du repo.
      const scopeWhere = journalEntryScope.where(scopeCtx(req)) ?? null;
      const result = await useCase.execute(
        {
          agencyId: agencyId as string,
          sourceType: sourceType as string,
          dateFrom: dateFrom as string | undefined,
          dateTo: dateTo as string | undefined,
          scopeWhere,
        },
        req.query as any,
      );
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  static async getEntry(req: Request, res: Response, next: NextFunction) {
    try {
      await journalEntryScope.assert(req.params.id, scopeCtx(req));
      const repo = container.resolve<any>(JOURNAL_ENTRY_REPOSITORY);
      const entry = await repo.findById(req.params.id);
      if (!entry) throw new NotFoundError('Ecriture comptable', req.params.id);
      res.json({ success: true, data: entry });
    } catch (err) {
      next(err);
    }
  }
}
