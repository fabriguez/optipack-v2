import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import { CreateContainerUseCase } from '../../application/use-cases/container/CreateContainerUseCase';
import { ListContainersUseCase } from '../../application/use-cases/container/ListContainersUseCase';
import { LoadParcelsUseCase } from '../../application/use-cases/container/LoadParcelsUseCase';
import { DepartContainerUseCase } from '../../application/use-cases/container/DepartContainerUseCase';
import { ArriveContainerUseCase } from '../../application/use-cases/container/ArriveContainerUseCase';
import { UnloadParcelUseCase } from '../../application/use-cases/container/UnloadParcelUseCase';
import { CONTAINER_REPOSITORY } from '../../application/interfaces/IContainerRepository';
import { PARCEL_REPOSITORY } from '../../application/interfaces/IParcelRepository';
import { NotFoundError } from '../../domain/errors/BusinessError';

export class ContainerController {
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(CreateContainerUseCase);
      const result = await useCase.execute(req.body);
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(ListContainersUseCase);
      const { departureAgencyId, arrivalAgencyId, status } = req.query;
      const result = await useCase.execute(
        {
          departureAgencyId: departureAgencyId as string,
          arrivalAgencyId: arrivalAgencyId as string,
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
