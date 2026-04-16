import { injectable } from 'tsyringe';
import type { InterAgencyRouting } from '@prisma/client';
import type {
  IRoutingRepository,
  RoutingWithRelations,
  CreateRoutingInput,
} from '../../../application/interfaces/IRoutingRepository';
import { prisma } from '../../../config/database';
import { NotFoundError } from '../../../domain/errors/BusinessError';

const ROUTING_INCLUDE = {
  parcel: { select: { id: true, trackingNumber: true, designation: true, destination: true } },
  sourceContainer: { select: { id: true, designation: true } },
  targetContainer: { select: { id: true, designation: true } },
};

@injectable()
export class PrismaRoutingRepository implements IRoutingRepository {
  async findByContainer(containerId: string): Promise<RoutingWithRelations[]> {
    return prisma.interAgencyRouting.findMany({
      where: { sourceContainerId: containerId },
      include: ROUTING_INCLUDE,
      orderBy: { createdAt: 'desc' },
    }) as Promise<RoutingWithRelations[]>;
  }

  async findByParcel(parcelId: string): Promise<RoutingWithRelations[]> {
    return prisma.interAgencyRouting.findMany({
      where: { parcelId },
      include: ROUTING_INCLUDE,
      orderBy: { createdAt: 'desc' },
    }) as Promise<RoutingWithRelations[]>;
  }

  async createRoutings(
    containerId: string,
    routings: CreateRoutingInput[],
  ): Promise<InterAgencyRouting[]> {
    const created = await prisma.$transaction(
      routings.map((r) =>
        prisma.interAgencyRouting.create({
          data: {
            sourceContainerId: containerId,
            parcelId: r.parcelId,
            sourceAgencyId: r.sourceAgencyId,
            targetAgencyId: r.targetAgencyId,
            targetCity: r.targetCity,
            routingStatus: 'PENDING',
          },
        }),
      ),
    );

    return created;
  }

  async redistributeAfterUnload(containerId: string): Promise<RoutingWithRelations[]> {
    const container = await prisma.container.findUnique({
      where: { id: containerId },
      include: {
        arrivalAgency: { select: { id: true, city: true } },
        parcels: {
          select: {
            id: true,
            destination: true,
            trackingNumber: true,
            designation: true,
          },
        },
      },
    });

    if (!container) throw new NotFoundError('Conteneur', containerId);

    const arrivalCity = container.arrivalAgency.city;
    const arrivalAgencyId = container.arrivalAgency.id;

    const parcelsNeedingRouting = container.parcels.filter(
      (parcel) => parcel.destination.toLowerCase() !== arrivalCity.toLowerCase(),
    );

    if (parcelsNeedingRouting.length === 0) return [];

    const targetCities = [...new Set(parcelsNeedingRouting.map((p) => p.destination))];
    const targetAgencies = await prisma.agency.findMany({
      where: {
        city: { in: targetCities, mode: 'insensitive' },
        isActive: true,
      },
      select: { id: true, city: true },
    });

    const cityToAgencyMap = new Map(
      targetAgencies.map((a) => [a.city.toLowerCase(), a.id]),
    );

    const routingData = parcelsNeedingRouting
      .filter((parcel) => cityToAgencyMap.has(parcel.destination.toLowerCase()))
      .map((parcel) => ({
        sourceContainerId: containerId,
        parcelId: parcel.id,
        sourceAgencyId: arrivalAgencyId,
        targetAgencyId: cityToAgencyMap.get(parcel.destination.toLowerCase())!,
        targetCity: parcel.destination,
        routingStatus: 'PENDING' as const,
      }));

    if (routingData.length === 0) return [];

    await prisma.interAgencyRouting.createMany({ data: routingData });

    return prisma.interAgencyRouting.findMany({
      where: {
        sourceContainerId: containerId,
        parcelId: { in: routingData.map((r) => r.parcelId) },
      },
      include: ROUTING_INCLUDE,
      orderBy: { createdAt: 'desc' },
    }) as Promise<RoutingWithRelations[]>;
  }
}
