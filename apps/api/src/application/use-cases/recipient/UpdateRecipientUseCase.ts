import { inject, injectable } from 'tsyringe';
import type { UpdateRecipientInput } from '@transitsoftservices/shared';
import { RECIPIENT_REPOSITORY, type IRecipientRepository } from '../../interfaces/IRecipientRepository';
import { NotFoundError } from '../../../domain/errors/BusinessError';

@injectable()
export class UpdateRecipientUseCase {
  constructor(
    @inject(RECIPIENT_REPOSITORY) private recipientRepo: IRecipientRepository,
  ) {}

  async execute(id: string, input: UpdateRecipientInput) {
    const recipient = await this.recipientRepo.findById(id);
    if (!recipient) {
      throw new NotFoundError('Destinataire', id);
    }
    return this.recipientRepo.update(id, input);
  }
}
