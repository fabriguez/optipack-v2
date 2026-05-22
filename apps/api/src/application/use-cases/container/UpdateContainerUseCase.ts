import { inject, injectable } from 'tsyringe';
import type { UpdateContainerInput } from '@transitsoftservices/shared';
import type { Prisma } from '@prisma/client';
import { CONTAINER_REPOSITORY, type IContainerRepository } from '../../interfaces/IContainerRepository';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';
import { HistoryService } from '../../services/HistoryService';

// Un conteneur est modifiable tant qu'il n'a pas quitte l'agence de depart :
// statut EMPTY ou LOADING. Des qu'il est IN_TRANSIT/RECEIVED/UNLOADED, ses
// caracteristiques sont figees (la modification fausserait les bordereaux).
const EDITABLE_STATUSES = new Set(['EMPTY', 'LOADING']);

@injectable()
export class UpdateContainerUseCase {
  constructor(
    @inject(CONTAINER_REPOSITORY) private containerRepo: IContainerRepository,
    private history: HistoryService,
  ) {}

  async execute(containerId: string, input: UpdateContainerInput, userId: string) {
    const container = await this.containerRepo.findById(containerId);
    if (!container) throw new NotFoundError('Conteneur', containerId);

    if (!EDITABLE_STATUSES.has(container.status)) {
      throw new BusinessError(
        `Le conteneur ne peut plus etre modifie (statut ${container.status}). Seuls les conteneurs vides ou en chargement sont modifiables.`,
      );
    }

    const data: Prisma.ContainerUpdateInput = {};
    const changes: Record<string, { from: unknown; to: unknown }> = {};

    if (input.designation !== undefined && input.designation !== container.designation) {
      data.designation = input.designation;
      changes.designation = { from: container.designation, to: input.designation };
    }
    if (input.type !== undefined && input.type !== container.type) {
      data.type = input.type;
      changes.type = { from: container.type, to: input.type };
    }
    if (input.carrier !== undefined) {
      const next = input.carrier?.trim() || null;
      if (next !== container.carrier) {
        data.carrier = next;
        changes.carrier = { from: container.carrier, to: next };
      }
    }
    if (input.capacity !== undefined && Number(input.capacity) !== Number(container.capacity)) {
      data.capacity = input.capacity;
      changes.capacity = { from: Number(container.capacity), to: input.capacity };
    }
    if (input.departureAgencyId !== undefined && input.departureAgencyId !== container.departureAgencyId) {
      data.departureAgency = { connect: { id: input.departureAgencyId } };
      changes.departureAgencyId = { from: container.departureAgencyId, to: input.departureAgencyId };
    }
    if (input.arrivalAgencyId !== undefined && input.arrivalAgencyId !== container.arrivalAgencyId) {
      data.arrivalAgency = { connect: { id: input.arrivalAgencyId } };
      changes.arrivalAgencyId = { from: container.arrivalAgencyId, to: input.arrivalAgencyId };
    }
    if (input.transitRouteId !== undefined && input.transitRouteId !== container.transitRouteId) {
      data.transitRoute = input.transitRouteId
        ? { connect: { id: input.transitRouteId } }
        : { disconnect: true };
      changes.transitRouteId = { from: container.transitRouteId, to: input.transitRouteId ?? null };
    }

    if (Object.keys(data).length === 0) return container;

    const updated = await this.containerRepo.update(containerId, data);

    await this.history.recordContainer({
      containerId,
      action: 'UPDATED',
      statusBefore: container.status,
      statusAfter: container.status,
      userId,
      comment: 'Modification des informations du conteneur',
      changes,
    });

    return updated;
  }
}
