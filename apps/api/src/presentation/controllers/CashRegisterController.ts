import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import { GetCashRegisterUseCase } from '../../application/use-cases/cash-register/GetCashRegisterUseCase';
import { CloseCashRegisterUseCase } from '../../application/use-cases/cash-register/CloseCashRegisterUseCase';
import { GetCashRegisterMovementsUseCase } from '../../application/use-cases/cash-register/GetCashRegisterMovementsUseCase';
import { scopeCtx, scopeEnforced } from '../../application/services/scope/agencyScope';
import { NotFoundError } from '../../domain/errors/BusinessError';

/**
 * Scope agence : les routes caisse sont indexees par agencyId (pas d'id
 * d'enregistrement) -> on verifie directement l'appartenance de l'agence.
 * Enforce : 404, shadow : log [SCOPE-DENY] et laisse passer.
 */
function assertAgencyInScope(req: Request): void {
  const ctx = scopeCtx(req);
  const agencyId = req.params.agencyId;
  if (ctx.unrestricted || ctx.agencyIds.includes(agencyId)) return;
  if (!scopeEnforced()) {
    // eslint-disable-next-line no-console
    console.warn(
      `[SCOPE-DENY] user=${ctx.userId} resource=AgencyCashRegister id=${agencyId} agencies=[${ctx.agencyIds.join(',')}]`,
    );
    return;
  }
  throw new NotFoundError('AgencyCashRegister', agencyId);
}

export class CashRegisterController {
  static async get(req: Request, res: Response, next: NextFunction) {
    try {
      assertAgencyInScope(req);
      const { agencyId } = req.params;
      const date = req.query.date as string | undefined;
      const useCase = container.resolve(GetCashRegisterUseCase);
      const register = await useCase.execute(agencyId, date);
      res.json({ success: true, data: register });
    } catch (err) {
      next(err);
    }
  }

  static async movements(req: Request, res: Response, next: NextFunction) {
    try {
      assertAgencyInScope(req);
      const { agencyId } = req.params;
      const cashRegisterId = req.query.cashRegisterId as string | undefined;
      const date = req.query.date as string | undefined;
      const all = req.query.all === 'true' || req.query.all === '1';
      const page = req.query.page ? Number(req.query.page) : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const useCase = container.resolve(GetCashRegisterMovementsUseCase);
      const data = await useCase.execute({ agencyId, cashRegisterId, date, all, page, limit });
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  static async close(req: Request, res: Response, next: NextFunction) {
    try {
      assertAgencyInScope(req);
      const { agencyId } = req.params;
      const useCase = container.resolve(CloseCashRegisterUseCase);
      const register = await useCase.execute(agencyId, req.user!.userId, req.body.notes);
      res.json({ success: true, data: register });
    } catch (err) {
      next(err);
    }
  }
}
