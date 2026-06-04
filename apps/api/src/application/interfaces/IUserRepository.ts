import type { User, Prisma } from '@prisma/client';

export interface IUserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  /** Resolution par email OU telephone : priorite email si l'input contient '@',
   *  sinon recherche telephone (premier match). */
  findByIdentifier(identifier: string): Promise<User | null>;
  findByIdWithAgencies(id: string): Promise<(User & { userAgencies: { agencyId: string }[] }) | null>;
  create(data: Prisma.UserCreateInput): Promise<User>;
  update(id: string, data: Prisma.UserUpdateInput): Promise<User>;
  delete(id: string): Promise<void>;
}

export const USER_REPOSITORY = Symbol.for('IUserRepository');
