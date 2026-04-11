import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import { CreateTransitRouteUseCase } from '../../application/use-cases/transit-route/CreateTransitRouteUseCase';
import { ListTransitRoutesUseCase } from '../../application/use-cases/transit-route/ListTransitRoutesUseCase';
import { UpdateTransitRouteUseCase } from '../../application/use-cases/transit-route/UpdateTransitRouteUseCase';
import { DeleteTransitRouteUseCase } from '../../application/use-cases/transit-route/DeleteTransitRouteUseCase';
import { TRANSIT_ROUTE_REPOSITORY } from '../../application/interfaces/ITransitRouteRepository';
import { NotFoundError } from '../../domain/errors/BusinessError';

const DEFAULT_ORG_ID = '00000000-0000-4000-a000-000000000001';

export class TransitRouteController {
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(CreateTransitRouteUseCase);
      const route = await useCase.execute(req.body, DEFAULT_ORG_ID);
      res.status(201).json({ success: true, data: route });
    } catch (err) {
      next(err);
    }
  }

  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(ListTransitRoutesUseCase);
      const result = await useCase.execute(DEFAULT_ORG_ID, req.query as any);
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  static async getActive(_req: Request, res: Response, next: NextFunction) {
    try {
      const repo = container.resolve<any>(TRANSIT_ROUTE_REPOSITORY);
      const routes = await repo.findActive(DEFAULT_ORG_ID);
      res.json({ success: true, data: routes });
    } catch (err) {
      next(err);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const repo = container.resolve<any>(TRANSIT_ROUTE_REPOSITORY);
      const route = await repo.findById(req.params.id);
      if (!route) throw new NotFoundError('Route de transit', req.params.id);
      res.json({ success: true, data: route });
    } catch (err) {
      next(err);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(UpdateTransitRouteUseCase);
      const route = await useCase.execute(req.params.id, req.body);
      res.json({ success: true, data: route });
    } catch (err) {
      next(err);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(DeleteTransitRouteUseCase);
      await useCase.execute(req.params.id);
      res.json({ success: true, message: 'Route de transit desactivee' });
    } catch (err) {
      next(err);
    }
  }
}
