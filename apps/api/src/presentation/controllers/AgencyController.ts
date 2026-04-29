import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import { CreateAgencyUseCase } from '../../application/use-cases/agency/CreateAgencyUseCase';
import { ListAgenciesUseCase } from '../../application/use-cases/agency/ListAgenciesUseCase';
import { GetAgencyUseCase } from '../../application/use-cases/agency/GetAgencyUseCase';
import { UpdateAgencyUseCase } from '../../application/use-cases/agency/UpdateAgencyUseCase';
import { DeleteAgencyUseCase } from '../../application/use-cases/agency/DeleteAgencyUseCase';
import { getOrgId } from '../middleware/tenantGuard';

export class AgencyController {
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(CreateAgencyUseCase);
      const agency = await useCase.execute(req.body, getOrgId(req));
      res.status(201).json({ success: true, data: agency });
    } catch (err) {
      next(err);
    }
  }

  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(ListAgenciesUseCase);
      const result = await useCase.execute(getOrgId(req), req.query as never);
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(GetAgencyUseCase);
      const agency = await useCase.execute(req.params.id);
      res.json({ success: true, data: agency });
    } catch (err) {
      next(err);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(UpdateAgencyUseCase);
      const agency = await useCase.execute(req.params.id, req.body);
      res.json({ success: true, data: agency });
    } catch (err) {
      next(err);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(DeleteAgencyUseCase);
      await useCase.execute(req.params.id);
      res.json({ success: true, message: 'Agence desactivee' });
    } catch (err) {
      next(err);
    }
  }
}
