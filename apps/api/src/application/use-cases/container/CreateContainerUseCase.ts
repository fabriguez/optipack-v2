import { inject, injectable } from 'tsyringe';
import type { CreateContainerInput } from '@transitsoftservices/shared';
import { CONTAINER_REPOSITORY, type IContainerRepository } from '../../interfaces/IContainerRepository';
import { AGENCY_REPOSITORY, type IAgencyRepository } from '../../interfaces/IAgencyRepository';
import { NotFoundError } from '../../../domain/errors/BusinessError';

@injectable()
export class CreateContainerUseCase {
  constructor(
    @inject(CONTAINER_REPOSITORY) private containerRepo: IContainerRepository,
    @inject(AGENCY_REPOSITORY) private agencyRepo: IAgencyRepository,
  ) {}

  async execute(input: CreateContainerInput) {
    const [depAgency, arrAgency] = await Promise.all([
      this.agencyRepo.findById(input.departureAgencyId),
      this.agencyRepo.findById(input.arrivalAgencyId),
    ]);

    if (!depAgency) throw new NotFoundError('Agence de depart', input.departureAgencyId);
    if (!arrAgency) throw new NotFoundError("Agence d'arrivee", input.arrivalAgencyId);

    return this.containerRepo.create({
      designation: input.designation,
      type: input.type,
      capacity: input.capacity,
      departureAgency: { connect: { id: input.departureAgencyId } },
      arrivalAgency: { connect: { id: input.arrivalAgencyId } },
      ...(input.transitRouteId && { transitRoute: { connect: { id: input.transitRouteId } } }),
    });
  }
}
