import { inject, injectable } from 'tsyringe';
import type { CreateContainerInput } from '@transitsoftservices/shared';
import { CONTAINER_REPOSITORY, type IContainerRepository } from '../../interfaces/IContainerRepository';
import { AGENCY_REPOSITORY, type IAgencyRepository } from '../../interfaces/IAgencyRepository';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';
import { HistoryService } from '../../services/HistoryService';

@injectable()
export class CreateContainerUseCase {
  constructor(
    @inject(CONTAINER_REPOSITORY) private containerRepo: IContainerRepository,
    @inject(AGENCY_REPOSITORY) private agencyRepo: IAgencyRepository,
    private history: HistoryService,
  ) {}

  async execute(input: CreateContainerInput & { isForwarding?: boolean }, userId: string) {
    const isForwarding = input.isForwarding === true;

    // Les conteneurs standards (non-acheminement) ne peuvent pas etre LAND
    if (!isForwarding && input.type === 'LAND') {
      throw new BusinessError(
        "Les conteneurs standards ne supportent que les types AIR ou SEA. Utilisez un conteneur d'acheminement pour le type LAND.",
      );
    }

    const [depAgency, arrAgency] = await Promise.all([
      this.agencyRepo.findById(input.departureAgencyId),
      this.agencyRepo.findById(input.arrivalAgencyId),
    ]);

    if (!depAgency) throw new NotFoundError('Agence de depart', input.departureAgencyId);
    if (!arrAgency) throw new NotFoundError("Agence d'arrivee", input.arrivalAgencyId);

    const created = await this.containerRepo.create({
      organizationId: depAgency.organizationId,
      designation: input.designation,
      type: input.type,
      isForwarding,
      capacity: input.capacity,
      departureAgency: { connect: { id: input.departureAgencyId } },
      arrivalAgency: { connect: { id: input.arrivalAgencyId } },
      ...(input.transitRouteId && { transitRoute: { connect: { id: input.transitRouteId } } }),
    });

    await this.history.recordContainer({
      containerId: created.id,
      action: 'CREATED',
      statusAfter: 'EMPTY',
      userId,
      comment: isForwarding ? "Conteneur d'acheminement cree" : 'Conteneur cree',
      changes: {
        designation: created.designation,
        type: created.type,
        capacity: Number(created.capacity),
        isForwarding,
        departureAgencyId: input.departureAgencyId,
        arrivalAgencyId: input.arrivalAgencyId,
      },
    });

    return created;
  }
}
