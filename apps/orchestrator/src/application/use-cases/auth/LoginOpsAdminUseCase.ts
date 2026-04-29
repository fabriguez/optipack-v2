import { injectable } from 'tsyringe';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { authenticator } from 'otplib';
import { prisma } from '../../../config/database';
import { config } from '../../../config';
import { AuthenticationError } from '../../../domain/errors/BusinessError';

export interface LoginInput {
  email: string;
  password: string;
  /** Si 2FA active, doit etre fourni au 2e tour. */
  totpCode?: string;
}

export interface LoginResult {
  // Si 2FA requis, on retourne juste le challenge pour que le client envoie le code
  requires2FA?: boolean;
  challengeToken?: string;
  // Sinon, JWT direct
  accessToken?: string;
  opsAdmin?: {
    id: string;
    email: string;
    fullName: string;
    isSuperAdmin: boolean;
  };
}

/**
 * Login en 2 etapes :
 * 1. POST /ops/auth/login { email, password } -> { requires2FA: true, challengeToken }
 * 2. POST /ops/auth/login { email, password, totpCode } -> { accessToken }
 *
 * Le challengeToken est un JWT court (5min) contenant le user id, signe avec un secret derive.
 * Si le user n'a pas encore configure le 2FA, il est force au premier login (cf. SetupTwoFactorUseCase).
 */
@injectable()
export class LoginOpsAdminUseCase {
  async execute(input: LoginInput): Promise<LoginResult> {
    const opsAdmin = await prisma.opsAdmin.findUnique({ where: { email: input.email } });
    if (!opsAdmin) throw new AuthenticationError('Email ou mot de passe incorrect');
    if (!opsAdmin.isActive) throw new AuthenticationError('Compte desactive');

    const passwordOk = await bcrypt.compare(input.password, opsAdmin.passwordHash);
    if (!passwordOk) throw new AuthenticationError('Email ou mot de passe incorrect');

    // Si pas encore configure -> retourner un challenge "setup_required"
    if (!opsAdmin.twoFactorEnabled || !opsAdmin.twoFactorSecret) {
      return {
        requires2FA: true,
        challengeToken: this.signChallenge(opsAdmin.id, 'setup_required'),
      };
    }

    // 2FA active : verifier le code si fourni
    if (!input.totpCode) {
      return {
        requires2FA: true,
        challengeToken: this.signChallenge(opsAdmin.id, 'totp_required'),
      };
    }

    const totpValid = authenticator.verify({
      token: input.totpCode,
      secret: opsAdmin.twoFactorSecret,
    });
    if (!totpValid) {
      throw new AuthenticationError('Code 2FA invalide');
    }

    await prisma.opsAdmin.update({
      where: { id: opsAdmin.id },
      data: { lastLoginAt: new Date() },
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
    };
  }

  private signChallenge(opsAdminId: string, kind: 'setup_required' | 'totp_required'): string {
    return jwt.sign(
      { sub: opsAdminId, kind, scope: 'ops_2fa_challenge' },
      config.jwt.secret as jwt.Secret,
      { expiresIn: '5m' } as jwt.SignOptions,
    );
  }
}
