import { inject, injectable } from 'tsyringe';
import type { PaginationInput } from '@optipack/shared';
import { CONTAINER_REPOSITORY, type IContainerRepository } from '../../interfaces/IContainerRepository';

@injectable()
export class ListContainersUseCase {
  constructor(
    @inject(CONTAINER_REPOSITORY) private containerRepo: IContainerRepository,
  ) {}

  async execute(
    filters: { departureAgencyId?: string; arrivalAgencyId?: string; status?: string; agencyIds?: string[] },
    pagination: PaginationInput,
  ) {
    return this.containerRepo.findAll(filters, pagination);
  }
}
