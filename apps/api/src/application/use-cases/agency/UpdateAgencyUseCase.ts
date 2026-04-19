import { inject, injectable } from 'tsyringe';
import type { UpdateAgencyInput } from '@transitsoftservices/shared';
import { AGENCY_REPOSITORY, type IAgencyRepository } from '../../interfaces/IAgencyRepository';
import { NotFoundError } from '../../../domain/errors/BusinessError';

@injectable()
export class UpdateAgencyUseCase {
  constructor(
    @inject(AGENCY_REPOSITORY) private agencyRepo: IAgencyRepository,
  ) {}

  async execute(id: string, input: UpdateAgencyInput) {
    const agency = await this.agencyRepo.findById(id);
    if (!agency) {
      throw new NotFoundError('Agence', id);
    }

    return this.agencyRepo.update(id, {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.address !== undefined && { address: input.address }),
      ...(input.city !== undefined && { city: input.city }),
      ...(input.country !== undefined && { country: input.country }),
      ...(input.phone !== undefined && { phone: input.phone }),
      ...(input.email !== undefined && { email: input.email || null }),
      ...(input.googleMapsLink !== undefined && { googleMapsLink: input.googleMapsLink || null }),
      ...(input.responsibleUserId !== undefined && {
        responsibleUser: { connect: { id: input.responsibleUserId } },
      }),
    });
  }
}
