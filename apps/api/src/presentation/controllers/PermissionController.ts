import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { BusinessError, NotFoundError } from '../../domain/errors/BusinessError';
import { ADMIN_ONLY_PERMISSION_KEYS } from '../../domain/constants/permissions';
import { bumpPermissionVersion } from '../../application/services/pvCache';

export class PermissionController {
  /** Catalogue complet des permissions, groupe par categorie. */
  static async list(_req: Request, res: Response, next: NextFunction) {
    try {
      const items = await prisma.permission.findMany({
        orderBy: [{ category: 'asc' }, { key: 'asc' }],
      });
      // `adminOnly` : cle reservee au role admin, NON assignable a un poste/override
      // (l'UI matrice la masque ou la desactive). Cf. ADMIN_ONLY_PERMISSION_KEYS.
      const data = items.map((p) => ({
        ...p,
        adminOnly: ADMIN_ONLY_PERMISSION_KEYS.includes(p.key),
      }));
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  /** Permissions effectives d'un user (poste + overrides). */
  static async listForUser(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await prisma.user.findFirst({
        // Scope tenant : un admin ne peut inspecter que les users de son organisation.
        where: { id: req.params.userId, organizationId: req.user!.organizationId },
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
      if (ADMIN_ONLY_PERMISSION_KEYS.includes(permissionKey)) {
        throw new BusinessError(`La permission ${permissionKey} est reservee au role administrateur`);
      }
      // Scope tenant : la cible doit appartenir a l'organisation de l'admin.
      const target = await prisma.user.findFirst({
        where: { id: userId, organizationId: req.user!.organizationId },
        select: { id: true },
      });
      if (!target) throw new NotFoundError('User', userId);

      const perm = await prisma.permission.findUnique({ where: { key: permissionKey } });
      if (!perm) throw new BusinessError(`Permission inconnue: ${permissionKey}`);

      const item = await prisma.userPermissionOverride.upsert({
        where: { userId_permissionId: { userId, permissionId: perm.id } },
        create: { userId, permissionId: perm.id, granted, reason: reason ?? null },
        update: { granted, reason: reason ?? null },
      });
      // Invalide le JWT en cours de l'utilisateur cible.
      await bumpPermissionVersion(userId);
      res.json({ success: true, data: item });
    } catch (err) {
      next(err);
    }
  }

  static async removeOverride(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId, permissionKey } = req.params;
      // Scope tenant : la cible doit appartenir a l'organisation de l'admin.
      const target = await prisma.user.findFirst({
        where: { id: userId, organizationId: req.user!.organizationId },
        select: { id: true },
      });
      if (!target) throw new NotFoundError('User', userId);
      const perm = await prisma.permission.findUnique({ where: { key: permissionKey } });
      if (!perm) throw new BusinessError(`Permission inconnue: ${permissionKey}`);
      await prisma.userPermissionOverride
        .delete({ where: { userId_permissionId: { userId, permissionId: perm.id } } })
        .catch(() => {});
      // Invalide le JWT en cours de l'utilisateur cible.
      await bumpPermissionVersion(userId);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  }
}
