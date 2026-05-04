import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import { CreateAgencyUseCase } from '../../application/use-cases/agency/CreateAgencyUseCase';
import { ListAgenciesUseCase } from '../../application/use-cases/agency/ListAgenciesUseCase';
import { GetAgencyUseCase } from '../../application/use-cases/agency/GetAgencyUseCase';
import { UpdateAgencyUseCase } from '../../application/use-cases/agency/UpdateAgencyUseCase';
import { DeleteAgencyUseCase } from '../../application/use-cases/agency/DeleteAgencyUseCase';
import { CreateAgencyChargeUseCase } from '../../application/use-cases/agency/CreateAgencyChargeUseCase';
import { UpdateAgencyChargeUseCase } from '../../application/use-cases/agency/UpdateAgencyChargeUseCase';
import { ListAgencyChargesUseCase } from '../../application/use-cases/agency/ListAgencyChargesUseCase';
import { PayAgencyChargeUseCase } from '../../application/use-cases/agency/PayAgencyChargeUseCase';
import { DeleteAgencyChargeUseCase } from '../../application/use-cases/agency/DeleteAgencyChargeUseCase';
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

  // -----------------------------------------------------------------
  // Charges recurrentes
  // -----------------------------------------------------------------

  static async listCharges(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(ListAgencyChargesUseCase);
      const period = (req.query.period as string | undefined) ?? undefined;
      const data = await useCase.execute(req.params.id, period);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  static async createCharge(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(CreateAgencyChargeUseCase);
      const charge = await useCase.execute(req.params.id, req.body);
      res.status(201).json({ success: true, data: charge });
    } catch (err) {
      next(err);
    }
  }

  static async updateCharge(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(UpdateAgencyChargeUseCase);
      const charge = await useCase.execute(req.params.chargeId, req.body);
      res.json({ success: true, data: charge });
    } catch (err) {
      next(err);
    }
  }

  static async deleteCharge(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(DeleteAgencyChargeUseCase);
      await useCase.execute(req.params.chargeId);
      res.json({ success: true, message: 'Charge desactivee ou supprimee' });
    } catch (err) {
      next(err);
    }
  }

  static async payCharge(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(PayAgencyChargeUseCase);
      const expense = await useCase.execute(req.params.chargeId, req.body, req.user!.userId);
      res.status(201).json({ success: true, data: expense });
    } catch (err) {
      next(err);
    }
  }
}
