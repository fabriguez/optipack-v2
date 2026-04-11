import { injectable } from 'tsyringe';
import type { RefreshToken } from '@prisma/client';
import type { IRefreshTokenRepository } from '../../../application/interfaces/IRefreshTokenRepository';
import { prisma } from '../../../config/database';

@injectable()
export class PrismaRefreshTokenRepository implements IRefreshTokenRepository {
  async create(userId: string, token: string, expiresAt: Date): Promise<RefreshToken> {
    return prisma.refreshToken.create({
      data: { userId, token, expiresAt },
    });
  }

  async findByToken(token: string): Promise<RefreshToken | null> {
    return prisma.refreshToken.findUnique({ where: { token } });
  }

  async deleteByToken(token: string): Promise<void> {
    await prisma.refreshToken.delete({ where: { token } }).catch(() => {});
  }

  async deleteAllForUser(userId: string): Promise<void> {
    await prisma.refreshToken.deleteMany({ where: { userId } });
  }
}
