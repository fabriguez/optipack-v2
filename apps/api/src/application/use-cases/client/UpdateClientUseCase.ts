import { inject, injectable } from 'tsyringe';
import type { UpdateClientInput } from '@transitsoftservices/shared';
import { CLIENT_REPOSITORY, type IClientRepository } from '../../interfaces/IClientRepository';
import { NotFoundError } from '../../../domain/errors/BusinessError';

@injectable()
export class UpdateClientUseCase {
  constructor(
    @inject(CLIENT_REPOSITORY) private clientRepo: IClientRepository,
  ) {}

  async execute(id: string, input: UpdateClientInput) {
    const client = await this.clientRepo.findById(id);
    if (!client) {
      throw new NotFoundError('Client', id);
    }

    return this.clientRepo.update(id, {
      ...(input.fullName !== undefined && { fullName: input.fullName }),
      ...(input.phone !== undefined && { phone: input.phone }),
      ...(input.email !== undefined && { email: input.email || null }),
      ...(input.address !== undefined && { address: input.address || null }),
      ...(input.clientType !== undefined && { clientType: input.clientType }),
      ...(input.loyaltyTier !== undefined && { loyaltyTier: input.loyaltyTier }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
      // Agence d'enregistrement optionnelle : agencyId=null deconnecte le lien.
      ...(input.agencyId !== undefined &&
        (input.agencyId
          ? { agency: { connect: { id: input.agencyId } } }
          : { agency: { disconnect: true } })),
    });
  }
}
