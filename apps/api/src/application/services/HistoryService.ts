import { injectable } from 'tsyringe';
import { prisma } from '../../config/database';

/**
 * Service centralise pour enregistrer l'historique des entites.
 * Toute action sur un colis ou conteneur DOIT passer par ce service.
 */

export interface ParcelHistoryInput {
  parcelId: string;
  action: string;
  statusBefore?: string | null;
  statusAfter?: string | null;
  wasPresentBefore?: boolean | null;
  isPresentAfter?: boolean | null;
  locationBefore?: string | null;
  locationAfter?: string | null;
  warehouseId?: string | null;
  containerId?: string | null;
  transitRouteId?: string | null;
  userId?: string | null;
  actorType?: string;
  actorName?: string | null;
  parcelDesignationSnapshot?: string | null;
  parcelTrackingSnapshot?: string | null;
  comment?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface ContainerHistoryInput {
  containerId: string;
  action: string;
  statusBefore?: string | null;
  statusAfter?: string | null;
  changes?: Record<string, unknown> | null;
  userId?: string | null;
  actorType?: string;
  actorName?: string | null;
  comment?: string | null;
}

@injectable()
export class HistoryService {
  async recordParcel(input: ParcelHistoryInput) {
    return prisma.parcelHistory.create({
      data: {
        parcelId: input.parcelId,
        action: input.action,
        statusBefore: input.statusBefore ?? null,
        statusAfter: input.statusAfter ?? null,
        wasPresentBefore: input.wasPresentBefore ?? null,
        isPresentAfter: input.isPresentAfter ?? null,
        locationBefore: input.locationBefore ?? null,
        locationAfter: input.locationAfter ?? null,
        warehouseId: input.warehouseId ?? null,
        containerId: input.containerId ?? null,
        transitRouteId: input.transitRouteId ?? null,
        userId: input.userId ?? null,
        actorType: input.actorType ?? 'USER',
        actorName: input.actorName ?? null,
        parcelDesignationSnapshot: input.parcelDesignationSnapshot ?? null,
        parcelTrackingSnapshot: input.parcelTrackingSnapshot ?? null,
        comment: input.comment ?? null,
        metadata: input.metadata as never,
      },
    });
  }

  async recordParcelMany(inputs: ParcelHistoryInput[]) {
    if (inputs.length === 0) return;
    return prisma.parcelHistory.createMany({
      data: inputs.map((i) => ({
        parcelId: i.parcelId,
        action: i.action,
        statusBefore: i.statusBefore ?? null,
        statusAfter: i.statusAfter ?? null,
        wasPresentBefore: i.wasPresentBefore ?? null,
        isPresentAfter: i.isPresentAfter ?? null,
        locationBefore: i.locationBefore ?? null,
        locationAfter: i.locationAfter ?? null,
        warehouseId: i.warehouseId ?? null,
        containerId: i.containerId ?? null,
        transitRouteId: i.transitRouteId ?? null,
        userId: i.userId ?? null,
        actorType: i.actorType ?? 'USER',
        actorName: i.actorName ?? null,
        parcelDesignationSnapshot: i.parcelDesignationSnapshot ?? null,
        parcelTrackingSnapshot: i.parcelTrackingSnapshot ?? null,
        comment: i.comment ?? null,
        metadata: i.metadata as never,
      })),
    });
  }

  async recordContainer(input: ContainerHistoryInput) {
    return prisma.containerHistory.create({
      data: {
        containerId: input.containerId,
        action: input.action,
        statusBefore: input.statusBefore ?? null,
        statusAfter: input.statusAfter ?? null,
        changes: input.changes as never,
        userId: input.userId ?? null,
        actorType: input.actorType ?? 'USER',
        actorName: input.actorName ?? null,
        comment: input.comment ?? null,
      },
    });
  }

  async listParcelHistory(parcelId: string) {
    return prisma.parcelHistory.findMany({
      where: { parcelId },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async listContainerHistory(containerId: string) {
    return prisma.containerHistory.findMany({
      where: { containerId },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }
}

export const HISTORY_SERVICE = Symbol.for('HistoryService');
