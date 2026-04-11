import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import { GetCashRegisterUseCase } from '../../application/use-cases/cash-register/GetCashRegisterUseCase';
import { CloseCashRegisterUseCase } from '../../application/use-cases/cash-register/CloseCashRegisterUseCase';

export class CashRegisterController {
  static async get(req: Request, res: Response, next: NextFunction) {
    try {
      const { agencyId } = req.params;
      const useCase = container.resolve(GetCashRegisterUseCase);
      const register = await useCase.execute(agencyId);
      res.json({ success: true, data: register });
    } catch (err) {
      next(err);
    }
  }

  static async close(req: Request, res: Response, next: NextFunction) {
    try {
      const { agencyId } = req.params;
      const useCase = container.resolve(CloseCashRegisterUseCase);
      const register = await useCase.execute(agencyId, req.user!.userId, req.body.notes);
      res.json({ success: true, data: register });
    } catch (err) {
      next(err);
    }
  }
}
