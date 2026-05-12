import { injectable } from 'tsyringe';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { prisma } from '../../../config/database';
import { config } from '../../../config';
import { AuthenticationError, BusinessError } from '../../../domain/errors/BusinessError';

const RECOVERY_CODES_COUNT = 10;

function generateRecoveryCode(): string {
  // 10 chars alphanumeriques en majuscules, separes en 2 groupes de 5 (XXXXX-XXXXX)
  const raw = randomBytes(8).toString('base64').replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 10);
  return `${raw.slice(0, 5)}-${raw.slice(5, 10)}`;
}

interface ChallengePayload {
  sub: string;
  kind: 'setup_required' | 'totp_required';
  scope: string;
}

/**
 * Setup 2FA :
 * 1. GET /ops/auth/2fa/setup avec challengeToken -> { secret, otpAuthUrl, qrCodeDataUrl }
 *    -> le ops admin scanne le QR avec Google Authenticator
 * 2. POST /ops/auth/2fa/confirm { challengeToken, totpCode }
 *    -> active le 2FA et retourne un accessToken
 */
@injectable()
export class SetupTwoFactorUseCase {
  async generateSecret(challengeToken: string) {
    const payload = this.verifyChallenge(challengeToken);
    if (payload.kind !== 'setup_required') {
      throw new BusinessError('Le 2FA est deja configure');
    }

    const opsAdmin = await prisma.opsAdmin.findUnique({ where: { id: payload.sub } });
    if (!opsAdmin) throw new AuthenticationError();

    const secret = authenticator.generateSecret();
    const otpAuthUrl = authenticator.keyuri(opsAdmin.email, config.totpIssuer, secret);
    const qrCodeDataUrl = await QRCode.toDataURL(otpAuthUrl);

    // On stocke le secret en attente. Il sera marque "enabled" quand le user
    // confirme avec un code valide via `confirm()`.
    await prisma.opsAdmin.update({
      where: { id: opsAdmin.id },
      data: { twoFactorSecret: secret },
    });

    return { secret, otpAuthUrl, qrCodeDataUrl };
  }

  async confirm(challengeToken: string, totpCode: string) {
    const payload = this.verifyChallenge(challengeToken);
    if (payload.kind !== 'setup_required') {
      throw new BusinessError('2FA setup deja effectue');
    }

    const opsAdmin = await prisma.opsAdmin.findUnique({ where: { id: payload.sub } });
    if (!opsAdmin || !opsAdmin.twoFactorSecret) {
      throw new BusinessError('Aucun secret 2FA en attente. Recommencez le setup.');
    }

    const valid = authenticator.verify({ token: totpCode, secret: opsAdmin.twoFactorSecret });
    if (!valid) throw new AuthenticationError('Code 2FA invalide');

    // Generation des codes de recuperation : on retourne les codes en clair une seule fois,
    // on stocke uniquement les hash bcrypt en BDD.
    const recoveryCodes = Array.from({ length: RECOVERY_CODES_COUNT }, generateRecoveryCode);
    const recoveryHashes = await Promise.all(
      recoveryCodes.map((c) => bcrypt.hash(c, config.bcryptRounds)),
    );

    await prisma.opsAdmin.update({
      where: { id: opsAdmin.id },
      data: {
        twoFactorEnabled: true,
        twoFactorRecoveryCodes: recoveryHashes,
        lastLoginAt: new Date(),
      },
    });

    const accessToken = jwt.sign(
      {
        sub: opsAdmin.id,
        email: opsAdmin.email,
        isSuperAdmin: opsAdmin.isSuperAdmin,
        scope: 'ops',
      },
      config.jwt.secret as jwt.Secret,
      { expiresIn: config.jwt.accessExpiry } as jwt.SignOptions,
    );

    return {
      accessToken,
      opsAdmin: {
        id: opsAdmin.id,
        email: opsAdmin.email,
        fullName: opsAdmin.fullName,
        isSuperAdmin: opsAdmin.isSuperAdmin,
      },
      // IMPORTANT : retournes en clair UNE SEULE FOIS. Le client doit les sauvegarder.
      recoveryCodes,
    };
  }

  /**
   * Self-setup 2FA depuis /me (deja authentifie). Genere un secret en attente
   * et un QR. Le 2FA n'est PAS encore active : il faut un appel a
   * `selfConfirm` avec un totp valide pour finaliser.
   * On accepte uniquement si twoFactorEnabled = false, sinon il faut un
   * disable explicite avant de re-setup.
   */
  async selfGenerateSecret(opsAdminId: string) {
    const opsAdmin = await prisma.opsAdmin.findUnique({ where: { id: opsAdminId } });
    if (!opsAdmin) throw new AuthenticationError();
    if (opsAdmin.twoFactorEnabled) {
      throw new BusinessError('2FA deja activee. Desactivez-la avant de la re-configurer.');
    }

    const secret = authenticator.generateSecret();
    const otpAuthUrl = authenticator.keyuri(opsAdmin.email, config.totpIssuer, secret);
    const qrCodeDataUrl = await QRCode.toDataURL(otpAuthUrl);

    await prisma.opsAdmin.update({
      where: { id: opsAdmin.id },
      data: { twoFactorSecret: secret },
    });

    return { secret, otpAuthUrl, qrCodeDataUrl };
  }

  async selfConfirm(opsAdminId: string, totpCode: string) {
    const opsAdmin = await prisma.opsAdmin.findUnique({ where: { id: opsAdminId } });
    if (!opsAdmin) throw new AuthenticationError();
    if (opsAdmin.twoFactorEnabled) {
      throw new BusinessError('2FA deja activee.');
    }
    if (!opsAdmin.twoFactorSecret) {
      throw new BusinessError('Aucun secret 2FA en attente. Relancez le setup.');
    }
    const valid = authenticator.verify({ token: totpCode, secret: opsAdmin.twoFactorSecret });
    if (!valid) throw new AuthenticationError('Code 2FA invalide');

    const recoveryCodes = Array.from({ length: RECOVERY_CODES_COUNT }, generateRecoveryCode);
    const recoveryHashes = await Promise.all(
      recoveryCodes.map((c) => bcrypt.hash(c, config.bcryptRounds)),
    );

    await prisma.opsAdmin.update({
      where: { id: opsAdmin.id },
      data: { twoFactorEnabled: true, twoFactorRecoveryCodes: recoveryHashes },
    });

    return { recoveryCodes };
  }

  /**
   * Login via un code de recuperation. Consomme le code (retire son hash de la liste).
   * Retourne un accessToken si match.
   */
  async useRecoveryCode(challengeToken: string, code: string) {
    const payload = this.verifyChallenge(challengeToken);
    if (payload.kind !== 'totp_required') {
      throw new BusinessError('Code de recuperation utilisable uniquement au login');
    }
    const opsAdmin = await prisma.opsAdmin.findUnique({ where: { id: payload.sub } });
    if (!opsAdmin || !opsAdmin.twoFactorEnabled) throw new AuthenticationError();

    const normalized = code.trim().toUpperCase();
    const remaining: string[] = [];
    let matchedHash: string | null = null;
    for (const hash of opsAdmin.twoFactorRecoveryCodes) {
      if (!matchedHash && (await bcrypt.compare(normalized, hash))) {
        matchedHash = hash;
      } else {
        remaining.push(hash);
      }
    }
    if (!matchedHash) throw new AuthenticationError('Code de recuperation invalide');

    await prisma.opsAdmin.update({
      where: { id: opsAdmin.id },
      data: { twoFactorRecoveryCodes: remaining, lastLoginAt: new Date() },
    });

    const accessToken = jwt.sign(
      {
        sub: opsAdmin.id,
        email: opsAdmin.email,
        isSuperAdmin: opsAdmin.isSuperAdmin,
        scope: 'ops',
      },
      config.jwt.secret as jwt.Secret,
      { expiresIn: config.jwt.accessExpiry } as jwt.SignOptions,
    );
    return {
      accessToken,
      remainingRecoveryCodes: remaining.length,
    };
  }

  /**
   * Regenere 10 nouveaux codes de recuperation (revoque les anciens).
   * Necessite que l'utilisateur soit deja authentifie ops.
   */
  async regenerateRecoveryCodes(opsAdminId: string): Promise<string[]> {
    const opsAdmin = await prisma.opsAdmin.findUnique({ where: { id: opsAdminId } });
    if (!opsAdmin || !opsAdmin.twoFactorEnabled) {
      throw new BusinessError('2FA non active');
    }
    const codes = Array.from({ length: RECOVERY_CODES_COUNT }, generateRecoveryCode);
    const hashes = await Promise.all(codes.map((c) => bcrypt.hash(c, config.bcryptRounds)));
    await prisma.opsAdmin.update({
      where: { id: opsAdminId },
      data: { twoFactorRecoveryCodes: hashes },
    });
    return codes;
  }

  private verifyChallenge(challengeToken: string): ChallengePayload {
    try {
      const decoded = jwt.verify(challengeToken, config.jwt.secret as jwt.Secret);
      const payload = decoded as unknown as ChallengePayload;
      if (payload.scope !== 'ops_2fa_challenge') {
        throw new AuthenticationError('Challenge token invalide');
      }
      return payload;
    } catch {
      throw new AuthenticationError('Challenge token invalide ou expire');
    }
  }
}
