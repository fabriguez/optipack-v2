import { inject, injectable } from 'tsyringe';
import { AGENCY_REPOSITORY, type IAgencyRepository } from '../../interfaces/IAgencyRepository';
import { NotFoundError } from '../../../domain/errors/BusinessError';
import { realtimeService } from '../../../infrastructure/realtime/RealtimeService';
import { cascadeDeactivateAgency } from '../../services/AgencyCascadeService';

@injectable()
export class DeleteAgencyUseCase {
  constructor(
    @inject(AGENCY_REPOSITORY) private agencyRepo: IAgencyRepository,
  ) {}

  async execute(id: string, organizationId: string) {
    const agency = await this.agencyRepo.findById(id);
    if (!agency || agency.organizationId !== organizationId) {
      throw new NotFoundError('Agence', id);
    }

    await this.agencyRepo.delete(id); // soft-delete : isActive=false
    // Cascade : coupe + deconnecte les comptes des employes de l'agence.
    await cascadeDeactivateAgency(id);
    realtimeService.emitResourceChange(agency.organizationId, 'agencies', 'deleted', id);
  }
}
