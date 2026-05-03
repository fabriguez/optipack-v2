import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import { CreateContainerUseCase } from '../../application/use-cases/container/CreateContainerUseCase';
import { ListContainersUseCase } from '../../application/use-cases/container/ListContainersUseCase';
import { LoadParcelsUseCase } from '../../application/use-cases/container/LoadParcelsUseCase';
import { ListLoadableParcelsUseCase } from '../../application/use-cases/container/ListLoadableParcelsUseCase';
import { LoadByQRCodeUseCase } from '../../application/use-cases/container/LoadByQRCodeUseCase';
import { RemoveParcelFromContainerUseCase } from '../../application/use-cases/container/RemoveParcelFromContainerUseCase';
import { DepartContainerUseCase } from '../../application/use-cases/container/DepartContainerUseCase';
import { ArriveContainerUseCase } from '../../application/use-cases/container/ArriveContainerUseCase';
import { UnloadParcelUseCase } from '../../application/use-cases/container/UnloadParcelUseCase';
import { CONTAINER_REPOSITORY } from '../../application/interfaces/IContainerRepository';
import { PARCEL_REPOSITORY } from '../../application/interfaces/IParcelRepository';
import { NotFoundError } from '../../domain/errors/BusinessError';
import { HistoryService } from '../../application/services/HistoryService';

export class ContainerController {
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(CreateContainerUseCase);
      const result = await useCase.execute(req.body, req.user!.userId);
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async getHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const history = container.resolve(HistoryService);
      const items = await history.listContainerHistory(req.params.id);
      res.json({ success: true, data: items });
    } catch (err) {
      next(err);
    }
  }

  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(ListContainersUseCase);
      const { departureAgencyId, arrivalAgencyId, status, isForwarding } = req.query;
      const isForwardingFlag =
        isForwarding === 'true' ? true : isForwarding === 'false' ? false : undefined;
      const result = await useCase.execute(
        {
          departureAgencyId: departureAgencyId as string,
          arrivalAgencyId: arrivalAgencyId as string,
          status: status as string,
          isForwarding: isForwardingFlag,
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
      const repo = container.resolve<any>(CONTAINER_REPOSITORY);
      const cont = await repo.findById(req.params.id);
      if (!cont) throw new NotFoundError('Conteneur', req.params.id);
      res.json({ success: true, data: cont });
    } catch (err) {
      next(err);
    }
  }

  static async getParcels(req: Request, res: Response, next: NextFunction) {
    try {
      const repo = container.resolve<any>(PARCEL_REPOSITORY);
      const parcels = await repo.findByContainer(req.params.id);
      res.json({ success: true, data: parcels });
    } catch (err) {
      next(err);
    }
  }

  static async loadParcels(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(LoadParcelsUseCase);
      const result = await useCase.execute(req.params.id, req.body.parcelIds, req.user!.userId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async getLoadableParcels(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(ListLoadableParcelsUseCase);
      const { search, page, limit } = req.query;
      const result = await useCase.execute(req.params.id, {
        search: search as string | undefined,
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
      });
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  static async loadByQr(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(LoadByQRCodeUseCase);
      const result = await useCase.execute(
        req.params.id,
        req.body.trackingNumber,
        req.user!.userId,
      );
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async removeParcel(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(RemoveParcelFromContainerUseCase);
      const result = await useCase.execute(
        req.params.id,
        req.body.parcelId,
        req.body.reason,
        req.user!.userId,
      );
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async depart(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(DepartContainerUseCase);
      const result = await useCase.execute(req.params.id, req.user!.userId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async arrive(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(ArriveContainerUseCase);
      const result = await useCase.execute(req.params.id, req.user!.userId);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async unloadParcel(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(UnloadParcelUseCase);
      const { parcelId, action, warehouseId, newWeight, comment } = req.body;
      const result = await useCase.execute(
        req.params.id,
        parcelId,
        action,
        warehouseId,
        req.user!.userId,
        { newWeight, comment },
      );
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
}
