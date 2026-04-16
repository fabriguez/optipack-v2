import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import { MANIFEST_REPOSITORY } from '../../application/interfaces/IManifestRepository';
import { NotFoundError } from '../../domain/errors/BusinessError';

export class ManifestController {
  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const repo = container.resolve<any>(MANIFEST_REPOSITORY);
      const { containerId, type, status } = req.query;
      const result = await repo.findAll(
        {
          containerId: containerId as string,
          type: type as string,
          status: status as string,
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
      const repo = container.resolve<any>(MANIFEST_REPOSITORY);
      const manifest = await repo.findById(req.params.id);
      if (!manifest) throw new NotFoundError('Bordereau', req.params.id);
      res.json({ success: true, data: manifest });
    } catch (err) {
      next(err);
    }
  }

  static async createDispatch(req: Request, res: Response, next: NextFunction) {
    try {
      const repo = container.resolve<any>(MANIFEST_REPOSITORY);
      const manifest = await repo.createDispatchManifest(
        req.params.containerId,
        req.user!.userId,
      );
      res.status(201).json({ success: true, data: manifest });
    } catch (err) {
      next(err);
    }
  }

  static async createReception(req: Request, res: Response, next: NextFunction) {
    try {
      const repo = container.resolve<any>(MANIFEST_REPOSITORY);
      const manifest = await repo.createReceptionManifest(
        req.params.containerId,
        req.user!.userId,
      );
      res.status(201).json({ success: true, data: manifest });
    } catch (err) {
      next(err);
    }
  }

  static async getComparison(req: Request, res: Response, next: NextFunction) {
    try {
      const repo = container.resolve<any>(MANIFEST_REPOSITORY);
      const comparison = await repo.getComparison(req.params.containerId);
      res.json({ success: true, data: comparison });
    } catch (err) {
      next(err);
    }
  }
}
