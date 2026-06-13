import { inject, injectable } from 'tsyringe';
import type { PaginationInput } from '@transitsoftservices/shared';
import { CONTAINER_REPOSITORY, type IContainerRepository } from '../../interfaces/IContainerRepository';

@injectable()
export class ListContainersUseCase {
  constructor(
    @inject(CONTAINER_REPOSITORY) private containerRepo: IContainerRepository,
  ) {}

  async execute(
    filters: {
      departureAgencyId?: string;
      arrivalAgencyId?: string;
      status?: string;
      isForwarding?: boolean;
      agencyIds?: string[];
      carrierId?: string;
      /** Scope agence (fragment Prisma) merge en AND par le repo. */
      scopeWhere?: object | null;
    },
    pagination: PaginationInput,
  ) {
    return this.containerRepo.findAll(filters, pagination);
  }
}
