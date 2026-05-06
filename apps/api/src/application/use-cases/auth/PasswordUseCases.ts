import { injectable } from 'tsyringe';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { prisma } from '../../../config/database';
import { AuthenticationError, BusinessError, NotFoundError } from '../../../domain/errors/BusinessError';
import { emailService } from '../../../infrastructure/email/EmailService';
import { config } from '../../../config';

@injectable()
export class ChangePasswordUseCase {
  /**
   * Change le mot de passe de l'utilisateur connecte. Verifie le mot de passe
   * actuel, hashe le nouveau, invalide tous les refresh tokens (force re-login).
   */
  async execute(userId: string, currentPassword: string, newPassword: string) {
    if (!newPassword || newPassword.length < 6) {
      throw new BusinessError('Le nouveau mot de passe doit contenir au moins 6 caracteres.');
    }
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('Utilisateur', userId);

    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) throw new AuthenticationError('Mot de passe actuel incorrect.');

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
      // Invalider tous les refresh tokens : l'utilisateur sera deconnecte sur les autres appareils
      prisma.refreshToken.deleteMany({ where: { userId } }),
    ]);
    return { ok: true };
  }
}

@injectable()
export class RequestPasswordResetUseCase {
  /**
   * Cree un token de reset valable 1h et envoie un mail.
   * Pour eviter l'enumeration de comptes, retourne toujours `{ ok: true }`
   * meme si l'email n'existe pas.
   */
  async execute(email: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) return { ok: true };

    // Invalide les tokens precedents non utilises
    await prisma.passwordResetToken.deleteMany({
      where: { userId: user.id, usedAt: null },
    });

    const token = randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1h

    await prisma.passwordResetToken.create({
      data: { userId: user.id, token, expiresAt },
    });

    const resetUrl = `${config.webUrl}/reset-password?token=${token}`;
    try {
      await emailService.sendPasswordResetLink(
        user.email,
        `${user.firstName} ${user.lastName}`,
        resetUrl,
      );
    } catch {
      // best-effort : on ne fait pas echouer la demande, l'admin peut verifier les logs
    }
    return { ok: true };
  }
}

@injectable()
export class ResetPasswordUseCase {
  async execute(token: string, newPassword: string) {
    if (!newPassword || newPassword.length < 6) {
      throw new BusinessError('Le mot de passe doit contenir au moins 6 caracteres.');
    }
    const item = await prisma.passwordResetToken.findUnique({ where: { token } });
    if (!item) throw new BusinessError('Token invalide ou expire.');
    if (item.usedAt) throw new BusinessError('Ce lien a deja ete utilise.');
    if (item.expiresAt < new Date()) throw new BusinessError('Ce lien a expire.');

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.$transaction([
      prisma.user.update({ where: { id: item.userId }, data: { passwordHash } }),
      prisma.passwordResetToken.update({
        where: { id: item.id },
        data: { usedAt: new Date() },
      }),
      prisma.refreshToken.deleteMany({ where: { userId: item.userId } }),
    ]);
    return { ok: true };
  }
}
