import { inject, injectable } from 'tsyringe';
import type { CreateRecipientInput } from '@transitsoftservices/shared';
import { RECIPIENT_REPOSITORY, type IRecipientRepository } from '../../interfaces/IRecipientRepository';

@injectable()
export class CreateRecipientUseCase {
  constructor(
    @inject(RECIPIENT_REPOSITORY) private recipientRepo: IRecipientRepository,
  ) {}

  async execute(input: CreateRecipientInput) {
    return this.recipientRepo.create({
      fullName: input.fullName,
      phone: input.phone,
      email: input.email || null,
      idNumber: input.idNumber || null,
      agency: { connect: { id: input.agencyId } },
    });
  }
}
