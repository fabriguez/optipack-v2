import { inject, injectable } from 'tsyringe';
import type { PaginationInput } from '@optipack/shared';
import { AGENCY_REPOSITORY, type IAgencyRepository } from '../../interfaces/IAgencyRepository';

@injectable()
export class ListAgenciesUseCase {
  constructor(
    @inject(AGENCY_REPOSITORY) private agencyRepo: IAgencyRepository,
  ) {}

  async execute(organizationId: string, pagination: PaginationInput) {
    return this.agencyRepo.findAll(organizationId, pagination);
  }
}
