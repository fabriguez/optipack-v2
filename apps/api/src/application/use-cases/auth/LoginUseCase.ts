import { inject, injectable } from 'tsyringe';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import type { LoginInput } from '@transitsoftservices/shared';
import { USER_REPOSITORY, type IUserRepository } from '../../interfaces/IUserRepository';
import {
  REFRESH_TOKEN_REPOSITORY,
  type IRefreshTokenRepository,
} from '../../interfaces/IRefreshTokenRepository';
import { AuthenticationError } from '../../../domain/errors/BusinessError';
import { config } from '../../../config';
import { PermissionService } from '../../services/PermissionService';

interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    agencyIds: string[];
    organizationId: string;
  };
  requires2FA?: boolean;
}

@injectable()
export class LoginUseCase {
  constructor(
    @inject(USER_REPOSITORY) private userRepo: IUserRepository,
    @inject(REFRESH_TOKEN_REPOSITORY) private refreshTokenRepo: IRefreshTokenRepository,
    private permissionService: PermissionService,
  ) {}

  async execute(input: LoginInput): Promise<LoginResult> {
    // Accepte email OU telephone via findByIdentifier. Le champ legacy
    // `email` du LoginInput contient l'identifiant brut, on garde la compat.
    const identifier = (input as { email?: string; identifier?: string }).identifier ?? input.email ?? '';
    const baseUser = await this.userRepo.findByIdentifier(identifier);
    const user = baseUser ? await this.userRepo.findByIdWithAgencies(baseUser.id) : null;

    if (!user) {
      throw new AuthenticationError('Identifiant ou mot de passe incorrect');
    }

    if (!user.isActive) {
      throw new AuthenticationError('Compte desactive');
    }

    const passwordValid = await bcrypt.compare(input.password, user.passwordHash);
    if (!passwordValid) {
      throw new AuthenticationError('Identifiant ou mot de passe incorrect');
    }

    // Check 2FA
    if (user.twoFactorEnabled) {
      return {
        accessToken: '',
        refreshToken: '',
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          agencyIds: user.userAgencies.map((ua) => ua.agencyId),
          organizationId: user.organizationId,
        },
        requires2FA: true,
      };
    }

    const agencyIds = user.userAgencies.map((ua) => ua.agencyId);
    // Phase 1 RH/ABAC : embarque les permissions effectives dans le JWT.
    const permissions = await this.permissionService.getEffectivePermissionsForUser(user.id);

    // Phase 0.2 : organizationId injecte dans le JWT pour data isolation multi-tenant
    const accessToken = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
        agencyIds,
        organizationId: user.organizationId,
        permissions,
        // Étape 7 : version des permissions — le middleware rejette un token
        // dont le pv ne correspond plus a la valeur DB (override ou poste change).
        pv: user.permissionVersion,
      },
      config.jwt.secret as jwt.Secret,
      { expiresIn: config.jwt.accessExpiry } as jwt.SignOptions,
    );

    // Trace de la validite du token : utile en debug session pour comprendre
    // pourquoi un user est deconnecte avant l'echeance attendue.
    const decoded = jwt.decode(accessToken) as { exp?: number; iat?: number } | null;
    if (decoded?.exp) {
      const ttlSec = decoded.exp - Math.floor(Date.now() / 1000);
      const expiresAtIso = new Date(decoded.exp * 1000).toISOString();
      // eslint-disable-next-line no-console
      console.log(
        `[Login] user=${user.email} accessExpiry=${config.jwt.accessExpiry} ttl=${ttlSec}s expiresAt=${expiresAtIso}`,
      );
    }

    const refreshTokenValue = randomUUID();
    const refreshExpiry = new Date();
    refreshExpiry.setDate(refreshExpiry.getDate() + 7);

    await this.refreshTokenRepo.create(user.id, refreshTokenValue, refreshExpiry);

    // Update last login
    await this.userRepo.update(user.id, { lastLoginAt: new Date() });

    return {
      accessToken,
      refreshToken: refreshTokenValue,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        agencyIds,
        organizationId: user.organizationId,
      },
    };
  }
}
