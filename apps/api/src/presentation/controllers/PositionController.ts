import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { BusinessError, NotFoundError } from '../../domain/errors/BusinessError';

export class PositionController {
  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const orgId = req.user!.organizationId;
      const agencyId = (req.query.agencyId as string | undefined) ?? null;
      const items = await prisma.position.findMany({
        where: {
          organizationId: orgId,
          ...(agencyId === null ? {} : { OR: [{ agencyId: null }, { agencyId }] }),
        },
        include: {
          permissions: { include: { permission: true } },
          _count: { select: { employees: true } },
        },
        orderBy: [{ hierarchyLevel: 'asc' }, { name: 'asc' }],
      });
      res.json({ success: true, data: items });
    } catch (err) {
      next(err);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const item = await prisma.position.findUnique({
        where: { id: req.params.id },
        include: {
          permissions: { include: { permission: true } },
          _count: { select: { employees: true } },
        },
      });
      if (!item) throw new NotFoundError('Position', req.params.id);
      res.json({ success: true, data: item });
    } catch (err) {
      next(err);
    }
  }

  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const orgId = req.user!.organizationId;
      const { name, description, hierarchyLevel, agencyId, permissionKeys } = req.body as {
        name: string;
        description?: string;
        hierarchyLevel?: number;
        agencyId?: string | null;
        permissionKeys?: string[];
      };
      if (!name?.trim()) throw new BusinessError('Nom du poste obligatoire');

      const created = await prisma.position.create({
        data: {
          organizationId: orgId,
          name: name.trim(),
          description: description?.trim() ?? null,
          hierarchyLevel: hierarchyLevel ?? 50,
          agencyId: agencyId ?? null,
          isSystem: false,
        },
      });

      if (permissionKeys && permissionKeys.length > 0) {
        await assignPermissionKeys(created.id, permissionKeys);
      }

      const full = await prisma.position.findUnique({
        where: { id: created.id },
        include: { permissions: { include: { permission: true } } },
      });
      res.status(201).json({ success: true, data: full });
    } catch (err) {
      next(err);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const { name, description, hierarchyLevel, isActive } = req.body;
      const item = await prisma.position.update({
        where: { id: req.params.id },
        data: {
          ...(name !== undefined && { name }),
          ...(description !== undefined && { description }),
          ...(hierarchyLevel !== undefined && { hierarchyLevel }),
          ...(isActive !== undefined && { isActive }),
        },
      });
      res.json({ success: true, data: item });
    } catch (err) {
      next(err);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const pos = await prisma.position.findUnique({ where: { id: req.params.id } });
      if (!pos) throw new NotFoundError('Position', req.params.id);
      if (pos.isSystem) throw new BusinessError('Impossible de supprimer un poste systeme');
      const usage = await prisma.employee.count({ where: { positionId: req.params.id } });
      if (usage > 0) throw new BusinessError(`${usage} employe(s) sont rattaches a ce poste`);
      await prisma.position.delete({ where: { id: req.params.id } });
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  }

  /** Remplace integralement la matrice de permissions du poste. */
  static async setPermissions(req: Request, res: Response, next: NextFunction) {
    try {
      const keys = (req.body.permissionKeys as string[]) ?? [];
      await assignPermissionKeys(req.params.id, keys);
      const full = await prisma.position.findUnique({
        where: { id: req.params.id },
        include: { permissions: { include: { permission: true } } },
      });
      res.json({ success: true, data: full });
    } catch (err) {
      next(err);
    }
  }
}

async function assignPermissionKeys(positionId: string, keys: string[]) {
  const perms = await prisma.permission.findMany({
    where: { key: { in: keys } },
    select: { id: true, key: true },
  });
  const missing = keys.filter((k) => !perms.find((p) => p.key === k));
  if (missing.length > 0) {
    throw new BusinessError(`Permissions inconnues: ${missing.join(', ')}`);
  }
  await prisma.$transaction([
    prisma.positionPermission.deleteMany({ where: { positionId } }),
    prisma.positionPermission.createMany({
      data: perms.map((p) => ({ positionId, permissionId: p.id })),
      skipDuplicates: true,
    }),
  ]);
}
