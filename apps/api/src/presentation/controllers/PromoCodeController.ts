import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import {
  CreatePromoCodeUseCase,
  DeletePromoCodeUseCase,
  GetPromoCodeUseCase,
  ListPromoCodeRedemptionsUseCase,
  ListPromoCodesUseCase,
  UpdatePromoCodeUseCase,
} from '../../application/use-cases/promo-code/PromoCodeAdminUseCases';
import {
  AssignPromoCodeUseCase,
  ListPromoCodeAssignmentsUseCase,
  UnassignPromoCodeUseCase,
} from '../../application/use-cases/promo-code/PromoCodeAssignmentUseCases';

/** Booleen de query string : 'true'/'false' -> boolean, absent -> undefined. */
function queryBool(v: unknown): boolean | undefined {
  if (v === 'true' || v === true) return true;
  if (v === 'false' || v === false) return false;
  return undefined;
}

export class PromoCodeController {
  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const q = req.query as Record<string, unknown>;
      const result = await container.resolve(ListPromoCodesUseCase).execute(
        req.user!.organizationId,
        {
          page: q.page ? Number(q.page) : undefined,
          limit: q.limit ? Number(q.limit) : undefined,
          search: typeof q.search === 'string' ? q.search : undefined,
          isActive: queryBool(q.isActive),
          visibility: q.visibility as 'PUBLIC' | 'PRIVATE' | 'ASSIGNED' | undefined,
          activeOnly: queryBool(q.activeOnly),
        },
      );
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await container
        .resolve(GetPromoCodeUseCase)
        .execute(req.user!.organizationId, req.params.id);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await container
        .resolve(CreatePromoCodeUseCase)
        .execute(req.user!.organizationId, req.body, req.user!.userId);
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await container
        .resolve(UpdatePromoCodeUseCase)
        .execute(req.user!.organizationId, req.params.id, req.body);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  static async remove(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await container
        .resolve(DeletePromoCodeUseCase)
        .execute(req.user!.organizationId, req.params.id);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  static async listRedemptions(req: Request, res: Response, next: NextFunction) {
    try {
      const q = req.query as Record<string, unknown>;
      const result = await container
        .resolve(ListPromoCodeRedemptionsUseCase)
        .execute(req.user!.organizationId, req.params.id, {
          page: q.page ? Number(q.page) : undefined,
          limit: q.limit ? Number(q.limit) : undefined,
        });
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  static async listAssignments(req: Request, res: Response, next: NextFunction) {
    try {
      const q = req.query as Record<string, unknown>;
      const result = await container
        .resolve(ListPromoCodeAssignmentsUseCase)
        .execute(req.user!.organizationId, req.params.id, {
          page: q.page ? Number(q.page) : undefined,
          limit: q.limit ? Number(q.limit) : undefined,
          search: typeof q.search === 'string' ? q.search : undefined,
        });
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  static async assign(req: Request, res: Response, next: NextFunction) {
    try {
      const assigned = await container
        .resolve(AssignPromoCodeUseCase)
        .execute(req.user!.organizationId, req.params.id, req.body, req.user!.userId);
      res.json({ success: true, data: { assigned } });
    } catch (err) {
      next(err);
    }
  }

  static async unassign(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await container
        .resolve(UnassignPromoCodeUseCase)
        .execute(req.user!.organizationId, req.params.id, req.params.clientId);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
}
