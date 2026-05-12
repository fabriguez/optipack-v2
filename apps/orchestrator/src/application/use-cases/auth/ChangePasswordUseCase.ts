import { injectable } from 'tsyringe';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../../../config/database';
import { config } from '../../../config';
import { AuthenticationError, NotFoundError } from '../../../domain/errors/BusinessError';

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Mot de passe actuel requis'),
    newPassword: z.string().min(10, '10 caracteres minimum'),
    confirmPassword: z.string().min(10),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: 'Les deux mots de passe ne correspondent pas',
    path: ['confirmPassword'],
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: 'Le nouveau doit etre different de l\'actuel',
    path: ['newPassword'],
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

@injectable()
export class ChangePasswordUseCase {
  /**
   * Change le mot de passe de l'ops admin authentifie.
   * Verifie le current password avant d'ecrire.
   */
  async execute(opsAdminId: string, input: ChangePasswordInput): Promise<void> {
    const admin = await prisma.opsAdmin.findUnique({ where: { id: opsAdminId } });
    if (!admin) throw new NotFoundError('OpsAdmin', opsAdminId);

    const ok = await bcrypt.compare(input.currentPassword, admin.passwordHash);
    if (!ok) throw new AuthenticationError('Mot de passe actuel incorrect');

    const newHash = await bcrypt.hash(input.newPassword, config.bcryptRounds);
    await prisma.opsAdmin.update({
      where: { id: opsAdminId },
      data: { passwordHash: newHash },
    });
  }
}
