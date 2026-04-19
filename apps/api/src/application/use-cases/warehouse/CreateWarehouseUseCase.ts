import { inject, injectable } from 'tsyringe';
import { WAREHOUSE_REPOSITORY, type IWarehouseRepository } from '../../interfaces/IWarehouseRepository';
import { AGENCY_REPOSITORY, type IAgencyRepository } from '../../interfaces/IAgencyRepository';
import { NotFoundError } from '../../../domain/errors/BusinessError';

interface CreateWarehouseInput {
  name: string;
  agencyId: string;
  location: string;
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

    return this.warehouseRepo.create({
      name: input.name,
      location: input.location,
      agency: { connect: { id: input.agencyId } },
    });
  }
}
