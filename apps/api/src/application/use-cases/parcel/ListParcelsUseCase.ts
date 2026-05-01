import { inject, injectable } from 'tsyringe';
import type { PaginationInput } from '@transitsoftservices/shared';
import { PARCEL_REPOSITORY, type IParcelRepository } from '../../interfaces/IParcelRepository';

@injectable()
export class ListParcelsUseCase {
  constructor(
    @inject(PARCEL_REPOSITORY) private parcelRepo: IParcelRepository,
  ) {}

  async execute(
    filters: { warehouseId?: string; containerId?: string; clientId?: string; status?: string; transitType?: string; agencyIds?: string[] | null },
    pagination: PaginationInput,
  ) {
    return this.parcelRepo.findAll(filters, pagination);
  }
}
