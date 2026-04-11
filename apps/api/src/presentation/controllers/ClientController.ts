import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import { CreateClientUseCase } from '../../application/use-cases/client/CreateClientUseCase';
import { ListClientsUseCase } from '../../application/use-cases/client/ListClientsUseCase';
import { GetClientUseCase } from '../../application/use-cases/client/GetClientUseCase';
import { UpdateClientUseCase } from '../../application/use-cases/client/UpdateClientUseCase';
import { DeleteClientUseCase } from '../../application/use-cases/client/DeleteClientUseCase';

const DEFAULT_ORG_ID = '00000000-0000-4000-a000-000000000001';

export class ClientController {
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(CreateClientUseCase);
      const client = await useCase.execute(req.body, DEFAULT_ORG_ID);
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
        { organizationId: DEFAULT_ORG_ID, agencyId },
        req.query as any,
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
