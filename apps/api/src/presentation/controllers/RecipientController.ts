import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import { CreateRecipientUseCase } from '../../application/use-cases/recipient/CreateRecipientUseCase';
import { ListRecipientsUseCase } from '../../application/use-cases/recipient/ListRecipientsUseCase';
import { UpdateRecipientUseCase } from '../../application/use-cases/recipient/UpdateRecipientUseCase';
import { DeleteRecipientUseCase } from '../../application/use-cases/recipient/DeleteRecipientUseCase';
import { RECIPIENT_REPOSITORY } from '../../application/interfaces/IRecipientRepository';
import { NotFoundError } from '../../domain/errors/BusinessError';

export class RecipientController {
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(CreateRecipientUseCase);
      const recipient = await useCase.execute(req.body);
      res.status(201).json({ success: true, data: recipient });
    } catch (err) {
      next(err);
    }
  }

  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const { agencyId } = req.params;
      const useCase = container.resolve(ListRecipientsUseCase);
      const result = await useCase.execute(agencyId, req.query as any);
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  static async listAll(req: Request, res: Response, next: NextFunction) {
    try {
      const repo = container.resolve<any>(RECIPIENT_REPOSITORY);
      const result = await repo.findAll(
        { agencyIds: req.user?.agencyIds },
        req.query as any,
      );
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const repo = container.resolve<any>(RECIPIENT_REPOSITORY);
      const recipient = await repo.findById(req.params.id);
      if (!recipient) throw new NotFoundError('Destinataire', req.params.id);
      res.json({ success: true, data: recipient });
    } catch (err) {
      next(err);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(UpdateRecipientUseCase);
      const recipient = await useCase.execute(req.params.id, req.body);
      res.json({ success: true, data: recipient });
    } catch (err) {
      next(err);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(DeleteRecipientUseCase);
      await useCase.execute(req.params.id);
      res.json({ success: true, message: 'Destinataire supprime' });
    } catch (err) {
      next(err);
    }
  }
}
