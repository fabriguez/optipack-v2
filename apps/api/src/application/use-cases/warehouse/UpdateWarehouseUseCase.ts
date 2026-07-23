import { inject, injectable } from 'tsyringe';
import { WAREHOUSE_REPOSITORY, type IWarehouseRepository } from '../../interfaces/IWarehouseRepository';
import { AGENCY_REPOSITORY, type IAgencyRepository } from '../../interfaces/IAgencyRepository';
import { NotFoundError } from '../../../domain/errors/BusinessError';
import { realtimeService } from '../../../infrastructure/realtime/RealtimeService';

interface UpdateWarehouseInput {
  name?: string;
  location?: string;
  storageFreeDays?: number;
  storageDailyRate?: number;
  isActive?: boolean;
}

@injectable()
export class UpdateWarehouseUseCase {
  constructor(
    @inject(WAREHOUSE_REPOSITORY) private warehouseRepo: IWarehouseRepository,
    @inject(AGENCY_REPOSITORY) private agencyRepo: IAgencyRepository,
  ) {}

  async execute(id: string, input: UpdateWarehouseInput) {
    const warehouse = await this.warehouseRepo.findById(id);
    if (!warehouse) {
      throw new NotFoundError('Magasin', id);
    }

    const updated = await this.warehouseRepo.update(id, input);
    const agency = await this.agencyRepo.findById(warehouse.agencyId);
    if (agency) realtimeService.emitResourceChange(agency.organizationId, 'warehouses', 'updated', id);
    return updated;
  }
}
