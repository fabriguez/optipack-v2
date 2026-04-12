import { inject, injectable } from 'tsyringe';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { USER_REPOSITORY, type IUserRepository } from '../../interfaces/IUserRepository';
import {
  REFRESH_TOKEN_REPOSITORY,
  type IRefreshTokenRepository,
} from '../../interfaces/IRefreshTokenRepository';
import { AuthenticationError } from '../../../domain/errors/BusinessError';
import { config } from '../../../config';

interface RefreshResult {
  accessToken: string;
  refreshToken: string;
}

@injectable()
export class RefreshTokenUseCase {
  constructor(
    @inject(USER_REPOSITORY) private userRepo: IUserRepository,
    @inject(REFRESH_TOKEN_REPOSITORY) private refreshTokenRepo: IRefreshTokenRepository,
  ) {}

  async execute(currentRefreshToken: string): Promise<RefreshResult> {
    const stored = await this.refreshTokenRepo.findByToken(currentRefreshToken);

    if (!stored || stored.expiresAt < new Date()) {
      if (stored) await this.refreshTokenRepo.deleteByToken(currentRefreshToken);
      throw new AuthenticationError('Refresh token invalide ou expire');
    }

    // Rotate: delete old, create new
    await this.refreshTokenRepo.deleteByToken(currentRefreshToken);

    const user = await this.userRepo.findByIdWithAgencies(stored.userId);
    if (!user || !user.isActive) {
      throw new AuthenticationError('Utilisateur introuvable ou desactive');
    }

    const agencyIds = user.userAgencies.map((ua) => ua.agencyId);

    const accessToken = jwt.sign(
      { userId: user.id, email: user.email, role: user.role, agencyIds },
      config.jwt.secret as jwt.Secret,
      { expiresIn: config.jwt.accessExpiry } as jwt.SignOptions,
    );

    const newRefreshToken = randomUUID();
    const refreshExpiry = new Date();
    refreshExpiry.setDate(refreshExpiry.getDate() + 7);

    await this.refreshTokenRepo.create(user.id, newRefreshToken, refreshExpiry);

    return { accessToken, refreshToken: newRefreshToken };
  }
}
