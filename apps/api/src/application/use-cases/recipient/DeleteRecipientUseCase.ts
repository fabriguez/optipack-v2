import { inject, injectable } from 'tsyringe';
import { RECIPIENT_REPOSITORY, type IRecipientRepository } from '../../interfaces/IRecipientRepository';
import { NotFoundError } from '../../../domain/errors/BusinessError';

@injectable()
export class DeleteRecipientUseCase {
  constructor(
    @inject(RECIPIENT_REPOSITORY) private recipientRepo: IRecipientRepository,
  ) {}

  async execute(id: string) {
    const recipient = await this.recipientRepo.findById(id);
    if (!recipient) {
      throw new NotFoundError('Destinataire', id);
    }
    await this.recipientRepo.delete(id);
  }
}
