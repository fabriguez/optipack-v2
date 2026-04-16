import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import { ROUTING_REPOSITORY } from '../../application/interfaces/IRoutingRepository';

export class RoutingController {
  static async listByContainer(req: Request, res: Response, next: NextFunction) {
    try {
      const repo = container.resolve<any>(ROUTING_REPOSITORY);
      const routings = await repo.findByContainer(req.params.containerId);
      res.json({ success: true, data: routings });
    } catch (err) {
      next(err);
    }
  }

  static async listByParcel(req: Request, res: Response, next: NextFunction) {
    try {
      const repo = container.resolve<any>(ROUTING_REPOSITORY);
      const routings = await repo.findByParcel(req.params.parcelId);
      res.json({ success: true, data: routings });
    } catch (err) {
      next(err);
    }
  }

  static async redistribute(req: Request, res: Response, next: NextFunction) {
    try {
      const repo = container.resolve<any>(ROUTING_REPOSITORY);
      const routings = await repo.redistributeAfterUnload(req.params.containerId);
      res.json({ success: true, data: routings });
    } catch (err) {
      next(err);
    }
  }
}
