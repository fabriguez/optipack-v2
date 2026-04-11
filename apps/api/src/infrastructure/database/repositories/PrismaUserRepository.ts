import { injectable } from 'tsyringe';
import type { User, Prisma } from '@prisma/client';
import type { IUserRepository } from '../../../application/interfaces/IUserRepository';
import { prisma } from '../../../config/database';

@injectable()
export class PrismaUserRepository implements IUserRepository {
  async findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id } });
  }

  async findByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { email } });
  }

  async findByIdWithAgencies(id: string) {
    return prisma.user.findUnique({
      where: { id },
      include: { userAgencies: { select: { agencyId: true } } },
    });
  }

  async create(data: Prisma.UserCreateInput): Promise<User> {
    return prisma.user.create({ data });
  }

  async update(id: string, data: Prisma.UserUpdateInput): Promise<User> {
    return prisma.user.update({ where: { id }, data });
  }

  async delete(id: string): Promise<void> {
    await prisma.user.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
