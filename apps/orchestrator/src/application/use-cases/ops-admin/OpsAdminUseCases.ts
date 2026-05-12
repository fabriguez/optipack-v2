import { injectable } from 'tsyringe';
import bcrypt from 'bcryptjs';
import { prisma } from '../../../config/database';
import { config } from '../../../config';
import {
  BusinessError,
  ConflictError,
  NotFoundError,
} from '../../../domain/errors/BusinessError';

// Schemas migres dans @transitsoftservices/ops-schemas.
import {
  inviteOpsAdminSchema,
  updateOpsAdminSchema,
  type InviteOpsAdminInput,
  type UpdateOpsAdminInput,
} from '@transitsoftservices/ops-schemas';
export { inviteOpsAdminSchema, updateOpsAdminSchema };
export type { InviteOpsAdminInput, UpdateOpsAdminInput };

function safeRandomPassword(): string {
  // Random password lisible : 16 chars hex
  return Array.from({ length: 8 }, () =>
    Math.floor(Math.random() * 256).toString(16).padStart(2, '0'),
  ).join('');
}

function toPublic<T extends { passwordHash: string; twoFactorSecret: string | null }>(admin: T) {
  const { passwordHash: _p, twoFactorSecret: _t, ...rest } = admin;
  return rest;
}

@injectable()
export class OpsAdminUseCases {
  async list(filters: { q?: string; page: number; pageSize: number }) {
    const where = filters.q
      ? {
          OR: [
            { email: { contains: filters.q, mode: 'insensitive' as const } },
            { fullName: { contains: filters.q, mode: 'insensitive' as const } },
          ],
        }
      : {};
    const [items, total] = await Promise.all([
      prisma.opsAdmin.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      prisma.opsAdmin.count({ where }),
    ]);
    return { items: items.map(toPublic), total };
  }

  async getById(id: string) {
    const admin = await prisma.opsAdmin.findUnique({ where: { id } });
    if (!admin) throw new NotFoundError('OpsAdmin', id);
    return toPublic(admin);
  }

  /**
   * Invite un nouvel ops admin.
   * Retourne le mot de passe initial (a transmettre par canal sur).
   * L'admin devra configurer son 2FA au 1er login (force par LoginOpsAdminUseCase).
   */
  async invite(input: InviteOpsAdminInput) {
    const dup = await prisma.opsAdmin.findUnique({ where: { email: input.email } });
    if (dup) throw new ConflictError(`Un ops-admin avec l'email ${input.email} existe deja`);

    const initialPassword = input.initialPassword ?? safeRandomPassword();
    const passwordHash = await bcrypt.hash(initialPassword, config.bcryptRounds);

    const created = await prisma.opsAdmin.create({
      data: {
        email: input.email,
        fullName: input.fullName,
        passwordHash,
        isSuperAdmin: input.isSuperAdmin ?? false,
        isActive: true,
      },
    });

    return {
      ...toPublic(created),
      // Une seule fois en sortie d'API. Jamais persiste en clair.
      initialPassword,
    };
  }

  async update(id: string, input: UpdateOpsAdminInput, actingAdminId: string) {
    const admin = await prisma.opsAdmin.findUnique({ where: { id } });
    if (!admin) throw new NotFoundError('OpsAdmin', id);

    // Empeche un admin de se desactiver lui-meme par megarde
    if (id === actingAdminId && input.isActive === false) {
      throw new BusinessError('Vous ne pouvez pas desactiver votre propre compte');
    }
    // Empeche le retrait du dernier super-admin
    if (admin.isSuperAdmin && input.isSuperAdmin === false) {
      const otherSupers = await prisma.opsAdmin.count({
        where: { isSuperAdmin: true, isActive: true, NOT: { id } },
      });
      if (otherSupers === 0) {
        throw new BusinessError("Impossible de retirer le statut super-admin du dernier super-admin actif");
      }
    }

    const updated = await prisma.opsAdmin.update({
      where: { id },
      data: {
        ...(input.fullName !== undefined && { fullName: input.fullName }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
        ...(input.isSuperAdmin !== undefined && { isSuperAdmin: input.isSuperAdmin }),
      },
    });
    return toPublic(updated);
  }

  /**
   * Reset 2FA en cas de perte de TOTP. Reserve aux super-admins.
   * Le user concerne devra reconfigurer son 2FA au prochain login.
   */
  async reset2FA(id: string, actingAdminId: string) {
    const admin = await prisma.opsAdmin.findUnique({ where: { id } });
    if (!admin) throw new NotFoundError('OpsAdmin', id);
    if (id === actingAdminId) {
      throw new BusinessError('Vous ne pouvez pas reset votre propre 2FA. Demandez a un autre super-admin.');
    }

    await prisma.opsAdmin.update({
      where: { id },
      data: { twoFactorSecret: null, twoFactorEnabled: false },
    });
  }
}
