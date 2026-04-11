import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import { GetLedgerUseCase } from '../../application/use-cases/accounting/GetLedgerUseCase';
import { JOURNAL_ENTRY_REPOSITORY } from '../../application/interfaces/IJournalEntryRepository';
import { NotFoundError } from '../../domain/errors/BusinessError';

export class AccountingController {
  static async getLedger(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(GetLedgerUseCase);
      const { agencyId, sourceType } = req.query;
      const result = await useCase.execute(
        { agencyId: agencyId as string, sourceType: sourceType as string },
        req.query as any,
      );
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  static async getEntry(req: Request, res: Response, next: NextFunction) {
    try {
      const repo = container.resolve<any>(JOURNAL_ENTRY_REPOSITORY);
      const entry = await repo.findById(req.params.id);
      if (!entry) throw new NotFoundError('Ecriture comptable', req.params.id);
      res.json({ success: true, data: entry });
    } catch (err) {
      next(err);
    }
  }
}
