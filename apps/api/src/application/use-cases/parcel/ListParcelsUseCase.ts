import { inject, injectable } from 'tsyringe';
import type { PaginationInput } from '@transitsoftservices/shared';
import { PARCEL_REPOSITORY, type IParcelRepository } from '../../interfaces/IParcelRepository';

@injectable()
export class ListParcelsUseCase {
  constructor(
    @inject(PARCEL_REPOSITORY) private parcelRepo: IParcelRepository,
  ) {}

  async execute(
    filters: {
      warehouseId?: string;
      containerId?: string;
      lastContainerId?: string;
      spaceId?: string;
      origin?: string;
      destination?: string;
      parcelGroupId?: string;
      clientId?: string;
      status?: string;
      transitType?: string;
      agencyIds?: string[] | null;
      /** Fragment Prisma de scope agence (etape 2), merge en AND par le repo. */
      scopeWhere?: object | null;
      onlyPresent?: boolean;
      archived?: 'true' | 'all' | 'false';
    },
    pagination: PaginationInput,
  ) {
    return this.parcelRepo.findAll(filters, pagination);
  }
}
