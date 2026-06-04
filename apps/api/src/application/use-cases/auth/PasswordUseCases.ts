import { injectable } from 'tsyringe';
import bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import { prisma } from '../../../config/database';
import { AuthenticationError, BusinessError, NotFoundError } from '../../../domain/errors/BusinessError';
import { notificationService } from '../../services/notifications/NotificationService';
import type { NotificationChannel } from '../../services/notifications/types';

// Duree de vie + tolerance du code OTP de reinitialisation.
const OTP_TTL_MS = 10 * 60 * 1000; // 10 min
const OTP_MAX_ATTEMPTS = 5; // au-dela, le code est invalide
// Canaux par defaut pour un reset staff : email uniquement (pas d'IN_APP, l'user
// n'est pas connecte). L'appelant peut surcharger (ex: ['EMAIL','SMS']).
const DEFAULT_RESET_CHANNELS: NotificationChannel[] = ['EMAIL'];
// Confirmation de changement/reinitialisation de mot de passe : envoyee a l'user
// apres coup, par email (+ in-app si connecte). Best-effort, ne bloque jamais.
const PASSWORD_CHANGED_CHANNELS: NotificationChannel[] = ['EMAIL'];
const PASSWORD_CHANGED_TITLE = 'Mot de passe modifie';
const PASSWORD_CHANGED_MESSAGE =
  'Votre mot de passe vient d\'etre modifie avec succes. ' +
  "Si vous n'etes pas a l'origine de cette action, contactez immediatement le support.";

/** Notifie l'utilisateur qu'un mot de passe a ete change. Best-effort. */
async function notifyPasswordChanged(user: {
  id: string;
  email: string;
  phone: string | null;
  organizationId: string;
}) {
  try {
    await notificationService.notify(
      { userId: user.id, email: user.email, phone: user.phone, organizationId: user.organizationId },
      {
        title: PASSWORD_CHANGED_TITLE,
        message: PASSWORD_CHANGED_MESSAGE,
        channels: PASSWORD_CHANGED_CHANNELS,
        metadata: { kind: 'PASSWORD_CHANGED' },
      },
    );
  } catch {
    // best-effort : un echec d'envoi ne doit pas casser le changement de mot de passe.
  }
}

/** Politique mot de passe alignee sur l'inscription : min 8, 1 majuscule, 1 chiffre. */
function assertPasswordPolicy(pwd: string) {
  if (!pwd || pwd.length < 8) {
    throw new BusinessError('Le mot de passe doit contenir au moins 8 caracteres.');
  }
  if (!/[A-Z]/.test(pwd)) {
    throw new BusinessError('Le mot de passe doit contenir au moins une majuscule.');
  }
  if (!/[0-9]/.test(pwd)) {
    throw new BusinessError('Le mot de passe doit contenir au moins un chiffre.');
  }
}

@injectable()
export class ChangePasswordUseCase {
  /**
   * Change le mot de passe de l'utilisateur connecte. Verifie le mot de passe
   * actuel, hashe le nouveau, invalide tous les refresh tokens (force re-login).
   */
  async execute(userId: string, currentPassword: string, newPassword: string) {
    assertPasswordPolicy(newPassword);
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
    await notifyPasswordChanged(user);
    return { ok: true };
  }
}

@injectable()
export class RequestPasswordResetUseCase {
  /**
   * Genere un code OTP a 6 chiffres valable 10 min et le dispatche via le
   * NotificationService sur les canaux demandes (EMAIL par defaut, SMS possible).
   * Le code est stocke hashe (bcrypt), jamais en clair.
   * Pour eviter l'enumeration de comptes, retourne toujours `{ ok: true }`
   * meme si l'email n'existe pas.
   */
  async execute(email: string, channels: NotificationChannel[] = DEFAULT_RESET_CHANNELS) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user || !user.isActive) return { ok: true };

    // Invalide les codes precedents non utilises (un seul code actif a la fois).
    await prisma.passwordResetToken.deleteMany({
      where: { userId: user.id, usedAt: null },
    });

    // Code a 6 chiffres (100000-999999), tirage cryptographique.
    const code = String(randomInt(100000, 1000000));
    const tokenHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);

    await prisma.passwordResetToken.create({
      data: { userId: user.id, token: tokenHash, expiresAt },
    });

    const ttlMin = Math.round(OTP_TTL_MS / 60000);
    try {
      // Dispatch best-effort multi-canal. On exclut IN_APP (user non connecte).
      await notificationService.notify(
        { userId: user.id, email: user.email, phone: user.phone, organizationId: user.organizationId },
        {
          title: 'Code de reinitialisation',
          message:
            `Votre code de reinitialisation est : ${code}. ` +
            `Il est valide ${ttlMin} minutes. Ne le communiquez a personne.`,
          channels: channels.length > 0 ? channels : DEFAULT_RESET_CHANNELS,
          metadata: { kind: 'PASSWORD_RESET' },
        },
      );
    } catch {
      // best-effort : on ne fait pas echouer la demande, l'admin peut verifier les logs
    }
    return { ok: true };
  }
}

@injectable()
export class ResetPasswordUseCase {
  /**
   * Verifie le couple (email, code OTP), applique la politique mot de passe,
   * met a jour le hash et invalide tous les refresh tokens.
   */
  async execute(email: string, code: string, newPassword: string) {
    assertPasswordPolicy(newPassword);

    const normalizedEmail = email.trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    // Message generique : pas de distinction email inconnu / code faux.
    if (!user) throw new BusinessError('Code invalide ou expire.');

    const item = await prisma.passwordResetToken.findFirst({
      where: { userId: user.id, usedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!item) throw new BusinessError('Code invalide ou expire.');
    if (item.expiresAt < new Date()) {
      await prisma.passwordResetToken.delete({ where: { id: item.id } });
      throw new BusinessError('Code expire. Demandez-en un nouveau.');
    }
    if (item.attempts >= OTP_MAX_ATTEMPTS) {
      await prisma.passwordResetToken.delete({ where: { id: item.id } });
      throw new BusinessError('Trop de tentatives. Demandez un nouveau code.');
    }

    const ok = await bcrypt.compare(code, item.token);
    if (!ok) {
      await prisma.passwordResetToken.update({
        where: { id: item.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BusinessError('Code invalide ou expire.');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
      prisma.passwordResetToken.update({
        where: { id: item.id },
        data: { usedAt: new Date() },
      }),
      prisma.refreshToken.deleteMany({ where: { userId: user.id } }),
    ]);
    await notifyPasswordChanged(user);
    return { ok: true };
  }
}
