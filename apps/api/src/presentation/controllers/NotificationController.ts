import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import {
  NOTIFICATION_REPOSITORY,
  type INotificationRepository,
} from '../../application/interfaces/INotificationRepository';
import { NotFoundError, AuthorizationError } from '../../domain/errors/BusinessError';
import { getOrgId } from '../middleware/tenantGuard';
import { prisma } from '../../config/database';
import { notificationService } from '../../application/services/notifications/NotificationService';
import type { NotificationChannel } from '../../application/services/notifications/types';

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

  /**
   * Centre de notifications (admin tenant) : liste tenant-scopee avec filtres
   * canal / statut / client / objet / date.
   */
  static async adminList(req: Request, res: Response, next: NextFunction) {
    try {
      const repo = container.resolve<INotificationRepository>(NOTIFICATION_REPOSITORY);
      const { type, status, clientId, eventKind, dateFrom, dateTo } = req.query;
      const result = await repo.findAllAdmin(
        {
          organizationId: getOrgId(req),
          type: type as string | undefined,
          status: status as string | undefined,
          clientId: clientId as string | undefined,
          eventKind: eventKind as string | undefined,
          dateFrom: dateFrom as string | undefined,
          dateTo: dateTo as string | undefined,
        },
        req.query as never,
      );
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  /** Agregats file d'attente (par statut + par canal) pour le centre de notifs. */
  static async adminStats(req: Request, res: Response, next: NextFunction) {
    try {
      const repo = container.resolve<INotificationRepository>(NOTIFICATION_REPOSITORY);
      const { type, status, clientId, eventKind, dateFrom, dateTo } = req.query;
      const stats = await repo.adminStats({
        organizationId: getOrgId(req),
        type: type as string | undefined,
        status: status as string | undefined,
        clientId: clientId as string | undefined,
        eventKind: eventKind as string | undefined,
        dateFrom: dateFrom as string | undefined,
        dateTo: dateTo as string | undefined,
      });
      res.json({ success: true, data: stats });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Rejoue une notification (canal echoue / en attente). Reconstruit la cible
   * et le payload depuis le row stocke et renvoie sur le meme canal, sans
   * re-resoudre de template (skipTemplate : on renvoie le texte deja rendu).
   */
  static async retry(req: Request, res: Response, next: NextFunction) {
    try {
      const repo = container.resolve<INotificationRepository>(NOTIFICATION_REPOSITORY);
      const n = await repo.findById(req.params.id);
      if (!n) throw new NotFoundError('Notification', req.params.id);

      const orgId = getOrgId(req);
      if (n.organizationId && n.organizationId !== orgId) {
        throw new AuthorizationError('Notification hors de votre organisation');
      }
      if (n.type === 'IN_APP') {
        throw new AuthorizationError('Une notification interne ne peut pas etre renvoyee');
      }

      const channel = n.type as NotificationChannel;
      const attachments = (n.attachments as never) ?? undefined;
      await notificationService.notify(
        {
          organizationId: n.organizationId ?? orgId,
          clientId: n.clientId ?? undefined,
          userId: n.userId ?? undefined,
          agencyId: n.agencyId ?? undefined,
          email: channel === 'EMAIL' ? n.recipient ?? undefined : undefined,
          phone: channel === 'WHATSAPP' || channel === 'SMS' ? n.recipient ?? undefined : undefined,
        },
        {
          title: n.title,
          message: n.message,
          channels: [channel],
          attachments,
          metadata: { ...((n.metadata as Record<string, unknown>) ?? {}), kind: n.eventKind ?? undefined, retryOf: n.id },
          skipTemplate: true,
        },
      );

      await prisma.notification.update({
        where: { id: n.id },
        data: { retryCount: { increment: 1 }, lastRetryAt: new Date() },
      });

      res.json({ success: true, message: 'Notification renvoyee' });
    } catch (err) {
      next(err);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const repo = container.resolve<any>(NOTIFICATION_REPOSITORY);
      const notification = await repo.findById(req.params.id);
      // Une notification appartient a son destinataire (userId). On renvoie 404
      // (et non 403) pour ne pas reveler l'existence d'un id d'un autre user.
      if (!notification || notification.userId !== req.user!.userId) {
        throw new NotFoundError('Notification', req.params.id);
      }
      res.json({ success: true, data: notification });
    } catch (err) {
      next(err);
    }
  }

  static async markAsRead(req: Request, res: Response, next: NextFunction) {
    try {
      const repo = container.resolve<any>(NOTIFICATION_REPOSITORY);
      const notification = await repo.findById(req.params.id);
      if (!notification || notification.userId !== req.user!.userId) {
        throw new NotFoundError('Notification', req.params.id);
      }
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
