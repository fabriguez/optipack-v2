import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import { CreateWarehouseUseCase } from '../../application/use-cases/warehouse/CreateWarehouseUseCase';
import { ListWarehousesUseCase } from '../../application/use-cases/warehouse/ListWarehousesUseCase';
import { UpdateWarehouseUseCase } from '../../application/use-cases/warehouse/UpdateWarehouseUseCase';
import { DeleteWarehouseUseCase } from '../../application/use-cases/warehouse/DeleteWarehouseUseCase';
import { WAREHOUSE_REPOSITORY } from '../../application/interfaces/IWarehouseRepository';
import { NotFoundError } from '../../domain/errors/BusinessError';

export class WarehouseController {
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(CreateWarehouseUseCase);
      const warehouse = await useCase.execute(req.body);
      res.status(201).json({ success: true, data: warehouse });
    } catch (err) {
      next(err);
    }
  }

  static async listAll(req: Request, res: Response, next: NextFunction) {
    try {
      const repo = container.resolve<any>(WAREHOUSE_REPOSITORY);
      const { agencyId } = req.query;
      const result = await repo.findByAgencies(
        req.user!.agencyIds,
        req.query as any,
        agencyId as string | undefined,
      );
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const { agencyId } = req.params;
      const useCase = container.resolve(ListWarehousesUseCase);
      const result = await useCase.execute(agencyId, req.query as any);
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const repo = container.resolve<any>(WAREHOUSE_REPOSITORY);
      const warehouse = await repo.findById(req.params.id);
      if (!warehouse) throw new NotFoundError('Magasin', req.params.id);
      res.json({ success: true, data: warehouse });
    } catch (err) {
      next(err);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(UpdateWarehouseUseCase);
      const warehouse = await useCase.execute(req.params.id, req.body);
      res.json({ success: true, data: warehouse });
    } catch (err) {
      next(err);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(DeleteWarehouseUseCase);
      await useCase.execute(req.params.id);
      res.json({ success: true, message: 'Magasin desactive' });
    } catch (err) {
      next(err);
    }
  }
}
