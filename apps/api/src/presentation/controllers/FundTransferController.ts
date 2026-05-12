import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import { CreateFundTransferUseCase } from '../../application/use-cases/fund-transfer/CreateFundTransferUseCase';
import { ConfirmFundTransferUseCase } from '../../application/use-cases/fund-transfer/ConfirmFundTransferUseCase';
import { VoidFundTransferUseCase } from '../../application/use-cases/fund-transfer/VoidFundTransferUseCase';
import { FUND_TRANSFER_REPOSITORY } from '../../application/interfaces/IFundTransferRepository';
import { NotFoundError } from '../../domain/errors/BusinessError';

export class FundTransferController {
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
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
      const useCase = container.resolve(VoidFundTransferUseCase);
      const reason = (req.body?.reason as string) || 'Annulation manuelle';
      const result = await useCase.execute(req.params.id, reason, req.user!.userId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
}
