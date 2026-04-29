import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import { CreateClientUseCase } from '../../application/use-cases/client/CreateClientUseCase';
import { ListClientsUseCase } from '../../application/use-cases/client/ListClientsUseCase';
import { GetClientUseCase } from '../../application/use-cases/client/GetClientUseCase';
import { UpdateClientUseCase } from '../../application/use-cases/client/UpdateClientUseCase';
import { DeleteClientUseCase } from '../../application/use-cases/client/DeleteClientUseCase';
import { getOrgId } from '../middleware/tenantGuard';

export class ClientController {
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(CreateClientUseCase);
      const client = await useCase.execute(req.body, getOrgId(req));
      res.status(201).json({ success: true, data: client });
    } catch (err) {
      next(err);
    }
  }

  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(ListClientsUseCase);
      const agencyId = req.query.agencyId as string | undefined;
      const result = await useCase.execute(
        { organizationId: getOrgId(req), agencyId },
        req.query as never,
      );
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(GetClientUseCase);
      const client = await useCase.execute(req.params.id);
      res.json({ success: true, data: client });
    } catch (err) {
      next(err);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(UpdateClientUseCase);
      const client = await useCase.execute(req.params.id, req.body);
      res.json({ success: true, data: client });
    } catch (err) {
      next(err);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(DeleteClientUseCase);
      await useCase.execute(req.params.id);
      res.json({ success: true, message: 'Client desactive' });
    } catch (err) {
      next(err);
    }
  }
}
