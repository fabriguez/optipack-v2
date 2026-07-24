import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import { CreateFundTransferUseCase } from '../../application/use-cases/fund-transfer/CreateFundTransferUseCase';
import { ConfirmFundTransferUseCase } from '../../application/use-cases/fund-transfer/ConfirmFundTransferUseCase';
import { VoidFundTransferUseCase } from '../../application/use-cases/fund-transfer/VoidFundTransferUseCase';
import { FUND_TRANSFER_REPOSITORY } from '../../application/interfaces/IFundTransferRepository';
import { NotFoundError } from '../../domain/errors/BusinessError';
import { assertAgencyInScope, fundTransferScope, scopeCtx } from '../../application/services/scope/agencyScope';

export class FundTransferController {
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      // Garde dure : un personnel n'initie un transfert que DEPUIS une de SES
      // agences (sourceAgencyId). L'agence DESTINATION n'est volontairement PAS
      // scopee. Absent quand la source est le siege (sourceType=HQ). Admin =>
      // bypass (ctx.unrestricted).
      const ctx = scopeCtx(req);
      const sourceAgencyId = req.body?.sourceAgencyId as string | undefined;
      if (sourceAgencyId) assertAgencyInScope(sourceAgencyId, ctx);
      const useCase = container.resolve(CreateFundTransferUseCase);
      const result = await useCase.execute(req.body, req.user!.userId);
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const repo = container.resolve<any>(FUND_TRANSFER_REPOSITORY);
      const q = req.query as Record<string, string | undefined>;
      const scopeWhere = fundTransferScope.where(scopeCtx(req)) ?? null;
      const result = await repo.findAll(
        {
          agencyIds: req.user!.agencyIds,
          scopeWhere,
          sourceAgencyId: q.sourceAgencyId,
          destinationAgencyId: q.destinationAgencyId,
          reference: q.reference,
          status: q.status as 'PENDING' | 'CONFIRMED' | 'VOIDED' | undefined,
          dateFrom: q.dateFrom,
          dateTo: q.dateTo,
          sourcePaymentMethod: q.sourcePaymentMethod,
          destinationPaymentMethod: q.destinationPaymentMethod,
          minAmount: q.minAmount ? Number(q.minAmount) : undefined,
          maxAmount: q.maxAmount ? Number(q.maxAmount) : undefined,
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
      await fundTransferScope.assert(req.params.id, scopeCtx(req));
      const repo = container.resolve<any>(FUND_TRANSFER_REPOSITORY);
      const item = await repo.findById(req.params.id);
      if (!item) throw new NotFoundError('Transfert de fonds', req.params.id);
      res.json({ success: true, data: item });
    } catch (err) {
      next(err);
    }
  }

  static async confirm(req: Request, res: Response, next: NextFunction) {
    try {
      await fundTransferScope.assert(req.params.id, scopeCtx(req));
      const useCase = container.resolve(ConfirmFundTransferUseCase);
      // Option bypassFourEyes : SUPER_ADMIN peut confirmer un transfert qu'il
      // a lui-meme initie (utile pour les agences a 1 admin).
      const result = await useCase.execute(req.params.id, req.user!.userId, {
        bypassFourEyes: req.body?.bypassFourEyes === true,
        userRole: req.user!.role,
      });
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async void(req: Request, res: Response, next: NextFunction) {
    try {
      await fundTransferScope.assert(req.params.id, scopeCtx(req));
      const useCase = container.resolve(VoidFundTransferUseCase);
      const reason = (req.body?.reason as string) || 'Annulation manuelle';
      const result = await useCase.execute(req.params.id, reason, req.user!.userId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
}
