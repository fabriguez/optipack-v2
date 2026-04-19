import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import { CreateParcelUseCase } from '../../application/use-cases/parcel/CreateParcelUseCase';
import { ListParcelsUseCase } from '../../application/use-cases/parcel/ListParcelsUseCase';
import { GetParcelUseCase } from '../../application/use-cases/parcel/GetParcelUseCase';
import { UpdateParcelStatusUseCase } from '../../application/use-cases/parcel/UpdateParcelStatusUseCase';

export class ParcelController {
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(CreateParcelUseCase);
      const result = await useCase.execute(req.body, req.user!.userId);
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(ListParcelsUseCase);
      const { warehouseId, containerId, clientId, status } = req.query;
      const result = await useCase.execute(
        {
          warehouseId: warehouseId as string,
          containerId: containerId as string,
          clientId: clientId as string,
          status: status as string,
          agencyIds: req.user!.agencyIds,
        },
        req.query as any,
      );
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(GetParcelUseCase);
      const parcel = await useCase.execute(req.params.id);
      res.json({ success: true, data: parcel });
    } catch (err) {
      next(err);
    }
  }

  static async getByTracking(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(GetParcelUseCase);
      const parcel = await useCase.execute(req.params.tracking);
      res.json({ success: true, data: parcel });
    } catch (err) {
      next(err);
    }
  }

  static async updateStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(UpdateParcelStatusUseCase);
      const warehouseChange = Object.prototype.hasOwnProperty.call(req.body, 'warehouseId')
        ? { warehouseId: (req.body.warehouseId as string | null) ?? null }
        : undefined;
      const parcel = await useCase.execute(
        req.params.id,
        req.body.status,
        req.user!.userId,
        warehouseChange,
      );
      res.json({ success: true, data: parcel });
    } catch (err) {
      next(err);
    }
  }
}
