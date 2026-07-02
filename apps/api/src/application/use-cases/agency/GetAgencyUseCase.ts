import { inject, injectable } from 'tsyringe';
import { AGENCY_REPOSITORY, type IAgencyRepository } from '../../interfaces/IAgencyRepository';
import { NotFoundError } from '../../../domain/errors/BusinessError';

@injectable()
export class GetAgencyUseCase {
  constructor(
    @inject(AGENCY_REPOSITORY) private agencyRepo: IAgencyRepository,
  ) {}

  async execute(id: string, organizationId: string) {
    const agency = await this.agencyRepo.findById(id);
    if (!agency || agency.organizationId !== organizationId) {
      throw new NotFoundError('Agence', id);
    }
    return agency;
  }
}
