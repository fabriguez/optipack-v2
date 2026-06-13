import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import {
  CreateParcelGroupUseCase,
  AddParcelToGroupUseCase,
  GenerateGroupInvoiceUseCase,
  SendGroupInvoiceUseCase,
  ListParcelGroupsUseCase,
  GetParcelGroupUseCase,
} from '../../application/use-cases/parcel-group/ParcelGroupUseCases';
import { getOrgId } from '../middleware/tenantGuard';
import { parcelGroupScope, scopeCtx } from '../../application/services/scope/agencyScope';

export class ParcelGroupController {
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(CreateParcelGroupUseCase);
      const result = await useCase.execute({
        ...req.body,
        organizationId: getOrgId(req),
      });
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(ListParcelGroupsUseCase);
      const result = await useCase.execute({
        clientId: req.query.clientId as string,
        agencyId: req.query.agencyId as string,
        status: req.query.status as string,
        scopeWhere: parcelGroupScope.where(scopeCtx(req)) ?? null,
      });
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async get(req: Request, res: Response, next: NextFunction) {
    try {
      await parcelGroupScope.assert(req.params.id, scopeCtx(req));
      const useCase = container.resolve(GetParcelGroupUseCase);
      const result = await useCase.execute(req.params.id);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async addParcel(req: Request, res: Response, next: NextFunction) {
    try {
      await parcelGroupScope.assert(req.params.id, scopeCtx(req));
      const useCase = container.resolve(AddParcelToGroupUseCase);
      const result = await useCase.execute(req.params.id, req.body, getOrgId(req));
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async generateInvoice(req: Request, res: Response, next: NextFunction) {
    try {
      await parcelGroupScope.assert(req.params.id, scopeCtx(req));
      const useCase = container.resolve(GenerateGroupInvoiceUseCase);
      const invoice = await useCase.execute(req.params.id);
      res.status(201).json({ success: true, data: invoice });
    } catch (err) {
      next(err);
    }
  }

  static async sendInvoice(req: Request, res: Response, next: NextFunction) {
    try {
      await parcelGroupScope.assert(req.params.id, scopeCtx(req));
      const useCase = container.resolve(SendGroupInvoiceUseCase);
      const result = await useCase.execute(req.params.id);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
}
