import { inject, injectable } from 'tsyringe';
import { WAREHOUSE_REPOSITORY, type IWarehouseRepository } from '../../interfaces/IWarehouseRepository';
import { NotFoundError } from '../../../domain/errors/BusinessError';

interface UpdateWarehouseInput {
  name?: string;
  location?: string;
}

@injectable()
export class UpdateWarehouseUseCase {
  constructor(
    @inject(WAREHOUSE_REPOSITORY) private warehouseRepo: IWarehouseRepository,
  ) {}

  async execute(id: string, input: UpdateWarehouseInput) {
    const warehouse = await this.warehouseRepo.findById(id);
    if (!warehouse) {
      throw new NotFoundError('Magasin', id);
    }

    return this.warehouseRepo.update(id, input);
  }
}
