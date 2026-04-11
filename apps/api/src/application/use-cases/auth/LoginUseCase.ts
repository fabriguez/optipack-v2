import { inject, injectable } from 'tsyringe';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import type { LoginInput } from '@optipack/shared';
import { USER_REPOSITORY, type IUserRepository } from '../../interfaces/IUserRepository';
import {
  REFRESH_TOKEN_REPOSITORY,
  type IRefreshTokenRepository,
} from '../../interfaces/IRefreshTokenRepository';
import { AuthenticationError } from '../../../domain/errors/BusinessError';
import { config } from '../../../config';

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
  };
  requires2FA?: boolean;
}

@injectable()
export class LoginUseCase {
  constructor(
    @inject(USER_REPOSITORY) private userRepo: IUserRepository,
    @inject(REFRESH_TOKEN_REPOSITORY) private refreshTokenRepo: IRefreshTokenRepository,
  ) {}

  async execute(input: LoginInput): Promise<LoginResult> {
    const user = await this.userRepo.findByIdWithAgencies(
      (await this.userRepo.findByEmail(input.email))?.id ?? '',
    );

    if (!user) {
      throw new AuthenticationError('Email ou mot de passe incorrect');
    }

    if (!user.isActive) {
      throw new AuthenticationError('Compte desactive');
    }

    const passwordValid = await bcrypt.compare(input.password, user.passwordHash);
    if (!passwordValid) {
      throw new AuthenticationError('Email ou mot de passe incorrect');
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
        },
        requires2FA: true,
      };
    }

    const agencyIds = user.userAgencies.map((ua) => ua.agencyId);

    const accessToken = jwt.sign(
      { userId: user.id, email: user.email, role: user.role, agencyIds },
      config.jwt.secret,
      { expiresIn: config.jwt.accessExpiry },
    );

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
      },
    };
  }
}
