import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import { BackupTenantUseCase } from '../../application/use-cases/backup/BackupTenantUseCase';

export class BackupController {
  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const items = await container.resolve(BackupTenantUseCase).list(req.params.id);
      res.json({
        success: true,
        data: items.map((b) => ({
          ...b,
          sizeBytes: b.sizeBytes !== null ? b.sizeBytes.toString() : null,
        })),
      });
    } catch (err) {
      next(err);
    }
  }

  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const id = await container
        .resolve(BackupTenantUseCase)
        .backupOne(req.params.id, 'manual');
      res.status(201).json({ success: true, data: { id } });
    } catch (err) {
      next(err);
    }
  }

  static async restore(req: Request, res: Response, next: NextFunction) {
    try {
      await container.resolve(BackupTenantUseCase).restore(req.params.backupId);
      res.json({ success: true, message: 'Restore lance' });
    } catch (err) {
      next(err);
    }
  }

  static async runNightly(_req: Request, res: Response, next: NextFunction) {
    try {
      const result = await container.resolve(BackupTenantUseCase).runNightly();
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
}
