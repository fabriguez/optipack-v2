import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import { RecordPaymentUseCase } from '../../application/use-cases/payment/RecordPaymentUseCase';
import { VoidPaymentUseCase } from '../../application/use-cases/payment/VoidPaymentUseCase';
import { PAYMENT_REPOSITORY } from '../../application/interfaces/IPaymentRepository';
import { NotFoundError } from '../../domain/errors/BusinessError';
import type { PaginationInput } from '@optipack/shared';

export class PaymentController {
  static async record(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(RecordPaymentUseCase);
      const result = await useCase.execute(req.body, req.user!.userId);
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const repo = container.resolve<any>(PAYMENT_REPOSITORY);
      const { agencyId } = req.query;
      const result = await repo.findAll(
        { agencyId: agencyId as string, agencyIds: req.user!.agencyIds },
        req.query as unknown as PaginationInput,
      );
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const repo = container.resolve<any>(PAYMENT_REPOSITORY);
      const payment = await repo.findById(req.params.id);
      if (!payment) throw new NotFoundError('Paiement', req.params.id);
      res.json({ success: true, data: payment });
    } catch (err) {
      next(err);
    }
  }

  static async getByInvoice(req: Request, res: Response, next: NextFunction) {
    try {
      const repo = container.resolve<any>(PAYMENT_REPOSITORY);
      const payments = await repo.findByInvoice(req.params.invoiceId);
      res.json({ success: true, data: payments });
    } catch (err) {
      next(err);
    }
  }

  static async void(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(VoidPaymentUseCase);
      const result = await useCase.execute(req.params.id, req.body.reason, req.user!.userId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
}
