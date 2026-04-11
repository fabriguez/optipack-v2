import { inject, injectable } from 'tsyringe';
import { AGENCY_REPOSITORY, type IAgencyRepository } from '../../interfaces/IAgencyRepository';
import { NotFoundError } from '../../../domain/errors/BusinessError';

@injectable()
export class DeleteAgencyUseCase {
  constructor(
    @inject(AGENCY_REPOSITORY) private agencyRepo: IAgencyRepository,
  ) {}

  async execute(id: string) {
    const agency = await this.agencyRepo.findById(id);
    if (!agency) {
      throw new NotFoundError('Agence', id);
    }

    await this.agencyRepo.delete(id);
  }
}
