import { inject, injectable } from 'tsyringe';
import type { CreateClientInput } from '@transitsoftservices/shared';
import { CLIENT_REPOSITORY, type IClientRepository } from '../../interfaces/IClientRepository';
import { AGENCY_REPOSITORY, type IAgencyRepository } from '../../interfaces/IAgencyRepository';
import { ConflictError, NotFoundError } from '../../../domain/errors/BusinessError';

@injectable()
export class CreateClientUseCase {
  constructor(
    @inject(CLIENT_REPOSITORY) private clientRepo: IClientRepository,
    @inject(AGENCY_REPOSITORY) private agencyRepo: IAgencyRepository,
  ) {}

  async execute(input: CreateClientInput, organizationId: string) {
    const agency = await this.agencyRepo.findById(input.agencyId);
    if (!agency) {
      throw new NotFoundError('Agence', input.agencyId);
    }

    const existing = await this.clientRepo.findByPhone(input.phone);
    if (existing) {
      throw new ConflictError('Un client avec ce numero de telephone existe deja');
    }

    return this.clientRepo.create({
      fullName: input.fullName,
      phone: input.phone,
      email: input.email || null,
      address: input.address || null,
      organizationId,
      agency: { connect: { id: input.agencyId } },
    });
  }
}
