import { inject, injectable } from 'tsyringe';
import { WAREHOUSE_REPOSITORY, type IWarehouseRepository } from '../../interfaces/IWarehouseRepository';
import { NotFoundError } from '../../../domain/errors/BusinessError';

@injectable()
export class DeleteWarehouseUseCase {
  constructor(
    @inject(WAREHOUSE_REPOSITORY) private warehouseRepo: IWarehouseRepository,
  ) {}

  async execute(id: string) {
    const warehouse = await this.warehouseRepo.findById(id);
    if (!warehouse) {
      throw new NotFoundError('Magasin', id);
    }

    await this.warehouseRepo.delete(id);
  }
}
