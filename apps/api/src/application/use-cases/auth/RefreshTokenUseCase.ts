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
import { PermissionService } from '../../services/PermissionService';

interface RefreshResult {
  accessToken: string;
  refreshToken: string;
}

@injectable()
export class RefreshTokenUseCase {
  constructor(
    @inject(USER_REPOSITORY) private userRepo: IUserRepository,
    @inject(REFRESH_TOKEN_REPOSITORY) private refreshTokenRepo: IRefreshTokenRepository,
    private permissionService: PermissionService,
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
    // Phase 1 RH/ABAC : recharge les permissions effectives a chaque refresh,
    // ce qui permet aux changements de matrice/poste de s'appliquer sans logout.
    const permissions = await this.permissionService.getEffectivePermissionsForUser(user.id);

    // Bug fix : on doit inclure organizationId dans le JWT (sinon multi-tenant
    // casse apres refresh -- les requetes auth-only sans tenant guard fonctionnent
    // mais les controllers qui lisent req.user.organizationId echouent).
    const accessToken = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
        agencyIds,
        organizationId: user.organizationId,
        permissions,
      },
      config.jwt.secret as jwt.Secret,
      { expiresIn: config.jwt.accessExpiry } as jwt.SignOptions,
    );

    const decoded = jwt.decode(accessToken) as { exp?: number } | null;
    if (decoded?.exp) {
      const ttlSec = decoded.exp - Math.floor(Date.now() / 1000);
      const expiresAtIso = new Date(decoded.exp * 1000).toISOString();
      // eslint-disable-next-line no-console
      console.log(
        `[Refresh] user=${user.email} accessExpiry=${config.jwt.accessExpiry} ttl=${ttlSec}s expiresAt=${expiresAtIso}`,
      );
    }

    const newRefreshToken = randomUUID();
    const refreshExpiry = new Date();
    refreshExpiry.setDate(refreshExpiry.getDate() + 7);

    await this.refreshTokenRepo.create(user.id, newRefreshToken, refreshExpiry);

    return { accessToken, refreshToken: newRefreshToken };
  }
}
