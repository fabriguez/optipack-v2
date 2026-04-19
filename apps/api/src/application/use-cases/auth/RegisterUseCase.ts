import { inject, injectable } from 'tsyringe';
import bcrypt from 'bcryptjs';
import type { RegisterInput } from '@transitsoftservices/shared';
import { USER_REPOSITORY, type IUserRepository } from '../../interfaces/IUserRepository';
import { ConflictError } from '../../../domain/errors/BusinessError';

interface RegisterResult {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

@injectable()
export class RegisterUseCase {
  constructor(
    @inject(USER_REPOSITORY) private userRepo: IUserRepository,
  ) {}

  async execute(input: RegisterInput, organizationId: string): Promise<RegisterResult> {
    const existing = await this.userRepo.findByEmail(input.email);
    if (existing) {
      throw new ConflictError('Un compte avec cet email existe deja');
    }

    const passwordHash = await bcrypt.hash(input.password, 12);

    const user = await this.userRepo.create({
      email: input.email,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      organization: { connect: { id: organizationId } },
    });

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    };
  }
}
