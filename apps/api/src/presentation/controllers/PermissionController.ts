import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { BusinessError, NotFoundError } from '../../domain/errors/BusinessError';

export class PermissionController {
  /** Catalogue complet des permissions, groupe par categorie. */
  static async list(_req: Request, res: Response, next: NextFunction) {
    try {
      const items = await prisma.permission.findMany({
        orderBy: [{ category: 'asc' }, { key: 'asc' }],
      });
      res.json({ success: true, data: items });
    } catch (err) {
      next(err);
    }
  }

  /** Permissions effectives d'un user (poste + overrides). */
  static async listForUser(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.params.userId },
        include: {
          employee: {
            include: {
              positionRef: {
                include: { permissions: { include: { permission: true } } },
              },
            },
          },
          permissionOverrides: { include: { permission: true } },
        },
      });
      if (!user) throw new NotFoundError('User', req.params.userId);

      const positionPerms =
        user.employee?.positionRef?.permissions.map((p) => p.permission) ?? [];
      res.json({
        success: true,
        data: {
          role: user.role,
          position: user.employee?.positionRef
            ? { id: user.employee.positionRef.id, name: user.employee.positionRef.name }
            : null,
          positionPermissions: positionPerms,
          overrides: user.permissionOverrides,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /** Pose un override individuel pour un user. */
  static async setOverride(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId } = req.params;
      const { permissionKey, granted, reason } = req.body as {
        permissionKey: string;
        granted: boolean;
        reason?: string;
      };
      const perm = await prisma.permission.findUnique({ where: { key: permissionKey } });
      if (!perm) throw new BusinessError(`Permission inconnue: ${permissionKey}`);

      const item = await prisma.userPermissionOverride.upsert({
        where: { userId_permissionId: { userId, permissionId: perm.id } },
        create: { userId, permissionId: perm.id, granted, reason: reason ?? null },
        update: { granted, reason: reason ?? null },
      });
      res.json({ success: true, data: item });
    } catch (err) {
      next(err);
    }
  }

  static async removeOverride(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId, permissionKey } = req.params;
      const perm = await prisma.permission.findUnique({ where: { key: permissionKey } });
      if (!perm) throw new BusinessError(`Permission inconnue: ${permissionKey}`);
      await prisma.userPermissionOverride
        .delete({ where: { userId_permissionId: { userId, permissionId: perm.id } } })
        .catch(() => {});
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  }
}
