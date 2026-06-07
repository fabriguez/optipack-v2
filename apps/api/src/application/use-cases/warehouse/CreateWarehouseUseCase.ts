import { inject, injectable } from 'tsyringe';
import { WAREHOUSE_REPOSITORY, type IWarehouseRepository } from '../../interfaces/IWarehouseRepository';
import { AGENCY_REPOSITORY, type IAgencyRepository } from '../../interfaces/IAgencyRepository';
import { NotFoundError } from '../../../domain/errors/BusinessError';
import { realtimeService } from '../../../infrastructure/realtime/RealtimeService';

interface CreateWarehouseInput {
  name: string;
  agencyId: string;
  location: string;
  storageFreeDays?: number;
  storageDailyRate?: number;
}

@injectable()
export class CreateWarehouseUseCase {
  constructor(
    @inject(WAREHOUSE_REPOSITORY) private warehouseRepo: IWarehouseRepository,
    @inject(AGENCY_REPOSITORY) private agencyRepo: IAgencyRepository,
  ) {}

  async execute(input: CreateWarehouseInput) {
    const agency = await this.agencyRepo.findById(input.agencyId);
    if (!agency) {
      throw new NotFoundError('Agence', input.agencyId);
    }

    const warehouse = await this.warehouseRepo.create({
      name: input.name,
      location: input.location,
      agency: { connect: { id: input.agencyId } },
      ...(input.storageFreeDays !== undefined && { storageFreeDays: input.storageFreeDays }),
      ...(input.storageDailyRate !== undefined && { storageDailyRate: input.storageDailyRate }),
    });

    realtimeService.emitResourceChange(agency.organizationId, 'warehouses', 'created', warehouse.id);
    return warehouse;
  }
}
