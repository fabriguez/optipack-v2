import { inject, injectable } from 'tsyringe';
import type { UpdateContainerInput } from '@transitsoftservices/shared';
import type { Prisma } from '@prisma/client';
import { CONTAINER_REPOSITORY, type IContainerRepository } from '../../interfaces/IContainerRepository';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';
import { HistoryService } from '../../services/HistoryService';
import { prisma } from '../../../config/database';

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
    if (input.carrierId !== undefined && input.carrierId !== (container as any).carrierId) {
      data.carrierEntity = input.carrierId
        ? { connect: { id: input.carrierId } }
        : { disconnect: true };
      changes.carrierId = { from: (container as any).carrierId ?? null, to: input.carrierId ?? null };
    }
    let costChanged = false;
    let newCost = 0;
    if (input.carrierCost !== undefined && Number(input.carrierCost) !== Number((container as any).carrierCost ?? 0)) {
      newCost = Number(input.carrierCost);
      data.carrierCost = newCost;
      changes.carrierCost = { from: Number((container as any).carrierCost ?? 0), to: newCost };
      costChanged = true;
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

    // Si carrierCost change, on synchronise la depense auto de transport
    // (TRANSPORT, isAutoFromForwarding = false, sans parent). On reutilise
    // la 1ere depense TRANSPORT non propagee comme cible. Si aucune, on en
    // cree une si newCost > 0.
    if (costChanged) {
      try {
        const existing = await prisma.expense.findFirst({
          where: {
            containerId,
            category: 'TRANSPORT',
            parentExpenseId: null,
            isAutoFromForwarding: false,
          },
          orderBy: { createdAt: 'asc' },
        });
        if (existing) {
          if (newCost > 0) {
            await prisma.expense.update({
              where: { id: existing.id },
              data: { amount: newCost },
            });
          } else {
            await prisma.expense.delete({ where: { id: existing.id } });
          }
        } else if (newCost > 0) {
          const carrierEntity = input.carrierId
            ? await prisma.carrier.findUnique({ where: { id: input.carrierId }, select: { name: true } })
            : null;
          const carrierName = carrierEntity?.name ?? container.carrier ?? 'Transporteur';
          await prisma.expense.create({
            data: {
              agencyId: container.departureAgencyId,
              title: `Transport ${carrierName} - ${container.designation}`,
              reason: `Cout transport conteneur ${container.designation}`,
              description: `Cout fixe convenu avec le transporteur ${carrierName}.`,
              category: 'TRANSPORT',
              amount: newCost,
              containerId,
              approvedByUserId: userId,
              isPaid: false,
            },
          });
        }
      } catch (err) {
        // Non bloquant : log dans l'historique.
        try {
          await this.history.recordContainer({
            containerId,
            action: 'TRANSPORT_EXPENSE_SYNC_FAILED',
            userId,
            comment: 'Echec synchronisation depense transport',
            changes: { error: err instanceof Error ? err.message : String(err) } as any,
          });
        } catch { /* skip */ }
      }
    }

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
