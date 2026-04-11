import { inject, injectable } from 'tsyringe';
import { PARCEL_REPOSITORY, type IParcelRepository } from '../../interfaces/IParcelRepository';
import { NotFoundError } from '../../../domain/errors/BusinessError';

@injectable()
export class GetParcelUseCase {
  constructor(
    @inject(PARCEL_REPOSITORY) private parcelRepo: IParcelRepository,
  ) {}

  async execute(idOrTracking: string) {
    // Try by ID first, then by tracking number
    let parcel = await this.parcelRepo.findById(idOrTracking);
    if (!parcel) {
      parcel = await this.parcelRepo.findByTracking(idOrTracking);
    }
    if (!parcel) {
      throw new NotFoundError('Colis', idOrTracking);
    }
    return parcel;
  }
}
