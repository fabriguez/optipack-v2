import { inject, injectable } from 'tsyringe';
import type { PaginationInput } from '@transitsoftservices/shared';
import { RECIPIENT_REPOSITORY, type IRecipientRepository } from '../../interfaces/IRecipientRepository';

@injectable()
export class ListRecipientsUseCase {
  constructor(
    @inject(RECIPIENT_REPOSITORY) private recipientRepo: IRecipientRepository,
  ) {}

  async execute(agencyId: string, pagination: PaginationInput) {
    return this.recipientRepo.findByAgency(agencyId, pagination);
  }
}
