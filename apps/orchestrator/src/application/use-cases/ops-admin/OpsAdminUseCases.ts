import { injectable } from 'tsyringe';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../../../config/database';
import { config } from '../../../config';
import {
  BusinessError,
  ConflictError,
  NotFoundError,
} from '../../../domain/errors/BusinessError';

export const inviteOpsAdminSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(2),
  // Mot de passe initial (a changer au 1er login). Si non fourni, on en genere un.
  initialPassword: z.string().min(8).optional(),
  isSuperAdmin: z.boolean().optional().default(false),
});

export const updateOpsAdminSchema = z.object({
  fullName: z.string().min(2).optional(),
  isActive: z.boolean().optional(),
  isSuperAdmin: z.boolean().optional(),
});

export type InviteOpsAdminInput = z.infer<typeof inviteOpsAdminSchema>;
export type UpdateOpsAdminInput = z.infer<typeof updateOpsAdminSchema>;

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
  async list() {
    const items = await prisma.opsAdmin.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return items.map(toPublic);
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
