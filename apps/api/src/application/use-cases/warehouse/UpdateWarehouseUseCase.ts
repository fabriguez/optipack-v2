import { inject, injectable } from 'tsyringe';
import { WAREHOUSE_REPOSITORY, type IWarehouseRepository } from '../../interfaces/IWarehouseRepository';
import { AGENCY_REPOSITORY, type IAgencyRepository } from '../../interfaces/IAgencyRepository';
import { NotFoundError } from '../../../domain/errors/BusinessError';
import { assertAgencyActive } from '../../services/scope/agencyScope';
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

    // Agence gelee : on interdit les edits "de contenu" (nom, localisation,
    // tarifs) d'un magasin rattache a une agence desactivee. EXCEPTION : quand
    // la maj porte sur isActive (activation/reactivation du magasin), on NE
    // bloque PAS, afin qu'un admin puisse encore (des)activer/reactiver un
    // magasin d'une agence gelee. La garde ne s'applique donc que hors toggle.
    if (input.isActive === undefined) {
      await assertAgencyActive(warehouse.agencyId);
    }

    const updated = await this.warehouseRepo.update(id, input);
    const agency = await this.agencyRepo.findById(warehouse.agencyId);
    if (agency) realtimeService.emitResourceChange(agency.organizationId, 'warehouses', 'updated', id);
    return updated;
  }
}
