import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import { RecordPaymentUseCase } from '../../application/use-cases/payment/RecordPaymentUseCase';
import { VoidPaymentUseCase } from '../../application/use-cases/payment/VoidPaymentUseCase';
import { PAYMENT_REPOSITORY } from '../../application/interfaces/IPaymentRepository';
import { NotFoundError } from '../../domain/errors/BusinessError';
import type { PaginationInput } from '@transitsoftservices/shared';
import { realtimeService } from '../../infrastructure/realtime/RealtimeService';
import { prisma } from '../../config/database';
import { invoiceScope, paymentScope, scopeCtx } from '../../application/services/scope/agencyScope';
import { applyFieldPolicy, PAYMENT_FIELD_POLICY } from '../serializers/fieldPolicy';
import { getPolicy } from '../middleware/policyContext';

export class PaymentController {
  static async record(req: Request, res: Response, next: NextFunction) {
    try {
      // Scope agence : la facture cible doit etre dans le scope du caissier.
      const bodyInvoiceId = (req.body as { invoiceId?: string })?.invoiceId;
      if (bodyInvoiceId) await invoiceScope.assert(bodyInvoiceId, scopeCtx(req));
      // SECURITE (integrite financiere) : l'agence d'imputation est derivee
      // cote serveur depuis invoice.agencyId dans RecordPaymentUseCase ; on ne
      // fait jamais confiance a body.agencyId (attribution d'encaissement a une
      // agence arbitraire, credit caisse + ecriture journal frauduleux).
      const useCase = container.resolve(RecordPaymentUseCase);
      const result = await useCase.execute(req.body, req.user!.userId);
      // Realtime : notifie le client proprietaire de la facture
      try {
        const invoiceId = (result as { invoiceId?: string })?.invoiceId;
        if (invoiceId) {
          const invoice = await prisma.invoice.findUnique({
            where: { id: invoiceId },
            select: { clientId: true },
          });
          if (invoice?.clientId) {
            realtimeService.toClient(invoice.clientId, 'payment:created', {
              payment: result,
              invoiceId,
            });
            realtimeService.toClient(invoice.clientId, 'invoice:updated', { invoiceId });
          }
        }
      } catch {
        /* non bloquant */
      }
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const repo = container.resolve<any>(PAYMENT_REPOSITORY);
      const { agencyId } = req.query;
      const scopeWhere = paymentScope.where(scopeCtx(req)) ?? null;
      const result = await repo.findAll(
        { agencyId: agencyId as string, agencyIds: req.user!.agencyIds, scopeWhere },
        req.query as unknown as PaginationInput,
      );
      const policy = getPolicy(req);
      const data = policy
        ? { ...result, data: applyFieldPolicy(result.data, PAYMENT_FIELD_POLICY, policy) }
        : result;
      res.json({ success: true, ...data });
    } catch (err) {
      next(err);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      await paymentScope.assert(req.params.id, scopeCtx(req));
      const repo = container.resolve<any>(PAYMENT_REPOSITORY);
      const payment = await repo.findById(req.params.id);
      if (!payment) throw new NotFoundError('Paiement', req.params.id);
      const policy = getPolicy(req);
      res.json({ success: true, data: policy ? applyFieldPolicy(payment, PAYMENT_FIELD_POLICY, policy) : payment });
    } catch (err) {
      next(err);
    }
  }

  static async getByInvoice(req: Request, res: Response, next: NextFunction) {
    try {
      await invoiceScope.assert(req.params.invoiceId, scopeCtx(req));
      const repo = container.resolve<any>(PAYMENT_REPOSITORY);
      const payments = await repo.findByInvoice(req.params.invoiceId);
      const policy = getPolicy(req);
      res.json({ success: true, data: policy ? applyFieldPolicy(payments, PAYMENT_FIELD_POLICY, policy) : payments });
    } catch (err) {
      next(err);
    }
  }

  static async void(req: Request, res: Response, next: NextFunction) {
    try {
      await paymentScope.assert(req.params.id, scopeCtx(req));
      const useCase = container.resolve(VoidPaymentUseCase);
      const result = await useCase.execute(req.params.id, req.body.reason, req.user!.userId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
}
