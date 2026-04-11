import { inject, injectable } from 'tsyringe';
import type { PaginationInput } from '@optipack/shared';
import { WAREHOUSE_REPOSITORY, type IWarehouseRepository } from '../../interfaces/IWarehouseRepository';

@injectable()
export class ListWarehousesUseCase {
  constructor(
    @inject(WAREHOUSE_REPOSITORY) private warehouseRepo: IWarehouseRepository,
  ) {}

  async execute(agencyId: string, pagination: PaginationInput) {
    return this.warehouseRepo.findByAgency(agencyId, pagination);
  }
}
