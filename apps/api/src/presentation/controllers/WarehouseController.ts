import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import { CreateWarehouseUseCase } from '../../application/use-cases/warehouse/CreateWarehouseUseCase';
import { ListWarehousesUseCase } from '../../application/use-cases/warehouse/ListWarehousesUseCase';
import { UpdateWarehouseUseCase } from '../../application/use-cases/warehouse/UpdateWarehouseUseCase';
import { DeleteWarehouseUseCase } from '../../application/use-cases/warehouse/DeleteWarehouseUseCase';
import { GetWarehouseSummaryUseCase } from '../../application/use-cases/warehouse/GetWarehouseSummaryUseCase';
import { StartInventoryUseCase } from '../../application/use-cases/warehouse/StartInventoryUseCase';
import { ScanInventoryParcelUseCase } from '../../application/use-cases/warehouse/ScanInventoryParcelUseCase';
import { CloseInventoryUseCase } from '../../application/use-cases/warehouse/CloseInventoryUseCase';
import { GetInventoryUseCase } from '../../application/use-cases/warehouse/GetInventoryUseCase';
import { MarkInventoryItemManuallyUseCase } from '../../application/use-cases/warehouse/MarkInventoryItemManuallyUseCase';
import { ListUninventoriedParcelsUseCase } from '../../application/use-cases/warehouse/ListUninventoriedParcelsUseCase';
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
      const scope = req.user!.role === 'SUPER_ADMIN' ? null : req.user!.agencyIds;
      const result = await repo.findByAgencies(
        scope,
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

  static async getSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(GetWarehouseSummaryUseCase);
      const data = await useCase.execute(req.params.id);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  static async startInventory(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(StartInventoryUseCase);
      const data = await useCase.execute(req.params.id, req.user!.userId, req.body?.comment);
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  static async listInventories(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(GetInventoryUseCase);
      const data = await useCase.listByWarehouse(req.params.id);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  static async getInventory(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(GetInventoryUseCase);
      const data = await useCase.execute(req.params.inventoryId);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  static async scanInventory(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(ScanInventoryParcelUseCase);
      const data = await useCase.execute(
        req.params.inventoryId,
        req.body.trackingNumber,
        req.user!.userId,
        req.body.observation,
      );
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Marquage manuel (sans scan) : present/absent + observation libre.
   * Le flag markedManually = true sur l'item permettra au rapport d'inventaire
   * de distinguer les items physiquement scannes des items pointes a la main.
   */
  static async markInventoryItemManual(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(MarkInventoryItemManuallyUseCase);
      const data = await useCase.execute(
        req.params.inventoryId,
        {
          parcelId: req.body.parcelId,
          present: req.body.present !== false,
          observation: req.body.observation,
        },
        req.user!.userId,
      );
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  /** Liste les colis du magasin pas encore inventories (= aucun item enregistre). */
  static async listUninventoried(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(ListUninventoriedParcelsUseCase);
      const data = await useCase.execute(req.params.inventoryId);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  static async closeInventory(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(CloseInventoryUseCase);
      const data = await useCase.execute(req.params.inventoryId, req.user!.userId);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
}
