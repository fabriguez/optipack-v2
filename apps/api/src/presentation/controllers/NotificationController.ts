import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import { NOTIFICATION_REPOSITORY } from '../../application/interfaces/INotificationRepository';
import { NotFoundError } from '../../domain/errors/BusinessError';

export class NotificationController {
  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const repo = container.resolve<any>(NOTIFICATION_REPOSITORY);
      const { status, clientId } = req.query;
      const result = await repo.findAll(
        {
          agencyIds: req.user!.agencyIds,
          userId: req.user!.userId,
          clientId: clientId as string,
          status: status as string,
        },
        req.query,
      );
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const repo = container.resolve<any>(NOTIFICATION_REPOSITORY);
      const notification = await repo.findById(req.params.id);
      if (!notification) throw new NotFoundError('Notification', req.params.id);
      res.json({ success: true, data: notification });
    } catch (err) {
      next(err);
    }
  }

  static async markAsRead(req: Request, res: Response, next: NextFunction) {
    try {
      const repo = container.resolve<any>(NOTIFICATION_REPOSITORY);
      const notification = await repo.findById(req.params.id);
      if (!notification) throw new NotFoundError('Notification', req.params.id);
      const updated = await repo.markAsRead(req.params.id);
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }

  static async markAllAsRead(req: Request, res: Response, next: NextFunction) {
    try {
      const repo = container.resolve<any>(NOTIFICATION_REPOSITORY);
      const count = await repo.markAllAsRead(req.user!.userId);
      res.json({ success: true, data: { count } });
    } catch (err) {
      next(err);
    }
  }

  static async countUnread(req: Request, res: Response, next: NextFunction) {
    try {
      const repo = container.resolve<any>(NOTIFICATION_REPOSITORY);
      const count = await repo.countUnread(req.user!.userId);
      res.json({ success: true, data: { count } });
    } catch (err) {
      next(err);
    }
  }
}
