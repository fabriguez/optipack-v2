import { inject, injectable } from 'tsyringe';
import { USER_REPOSITORY, type IUserRepository } from '../../interfaces/IUserRepository';
import { NotFoundError } from '../../../domain/errors/BusinessError';

@injectable()
export class GetMeUseCase {
  constructor(
    @inject(USER_REPOSITORY) private userRepo: IUserRepository,
  ) {}

  async execute(userId: string) {
    const user = await this.userRepo.findByIdWithAgencies(userId);
    if (!user) {
      throw new NotFoundError('Utilisateur');
    }

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      role: user.role,
      isVerified: user.isVerified,
      twoFactorEnabled: user.twoFactorEnabled,
      agencyIds: user.userAgencies.map((ua) => ua.agencyId),
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
    };
  }
}
