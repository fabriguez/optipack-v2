import { injectable } from 'tsyringe';
import type { ShippingManifest, ManifestLine, Prisma } from '@prisma/client';
import type {
  IManifestRepository,
  ManifestWithLines,
  ManifestComparison,
} from '../../../application/interfaces/IManifestRepository';
import type { PaginationInput, PaginatedResponse } from '@optipack/shared';
import { prisma } from '../../../config/database';
import { NotFoundError } from '../../../domain/errors/BusinessError';

const MANIFEST_INCLUDE = {
  lines: true,
  container: { select: { id: true, designation: true, status: true } },
};

@injectable()
export class PrismaManifestRepository implements IManifestRepository {
  async findById(id: string): Promise<ManifestWithLines | null> {
    return prisma.shippingManifest.findUnique({
      where: { id },
      include: MANIFEST_INCLUDE,
    }) as Promise<ManifestWithLines | null>;
  }

  async findByContainer(containerId: string): Promise<ManifestWithLines[]> {
    return prisma.shippingManifest.findMany({
      where: { containerId },
      include: MANIFEST_INCLUDE,
      orderBy: { createdAt: 'desc' },
    }) as Promise<ManifestWithLines[]>;
  }

  async findAll(
    filters: { containerId?: string; type?: string; status?: string },
    pagination: PaginationInput,
  ): Promise<PaginatedResponse<ManifestWithLines>> {
    const { page, limit, sortBy, sortOrder, search } = pagination;
    const skip = (page - 1) * limit;

    const where: Prisma.ShippingManifestWhereInput = {
      ...(filters.containerId && { containerId: filters.containerId }),
      ...(filters.type && { type: filters.type as any }),
      ...(filters.status && { status: filters.status as any }),
      ...(search && {
        OR: [
          { number: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      prisma.shippingManifest.findMany({
        where,
        skip,
        take: limit,
        orderBy: sortBy ? { [sortBy]: sortOrder } : { createdAt: 'desc' },
        include: MANIFEST_INCLUDE,
      }),
      prisma.shippingManifest.count({ where }),
    ]);

    return {
      data: data as ManifestWithLines[],
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async createDispatchManifest(containerId: string, _userId: string): Promise<ManifestWithLines> {
    const container = await prisma.container.findUnique({
      where: { id: containerId },
      include: {
        parcels: true,
        departureAgency: { select: { city: true } },
        arrivalAgency: { select: { city: true } },
      },
    });

    if (!container) throw new NotFoundError('Conteneur', containerId);

    const count = await prisma.shippingManifest.count({
      where: { containerId, type: 'DISPATCH' },
    });

    const manifest = await prisma.shippingManifest.create({
      data: {
        containerId,
        number: `BRD-DISP-${count + 1}`,
        type: 'DISPATCH',
        status: 'ACTIVE',
        lines: {
          create: container.parcels.map((parcel) => ({
            parcelId: parcel.id,
            designation: parcel.designation,
            weight: parcel.weight,
            origin: parcel.origin || container.departureAgency.city,
            destination: parcel.destination || container.arrivalAgency.city,
            transit: container.arrivalAgency.city,
            price: parcel.price,
            status: parcel.status,
          })),
        },
      },
      include: MANIFEST_INCLUDE,
    });

    return manifest as ManifestWithLines;
  }

  async createReceptionManifest(containerId: string, _userId: string): Promise<ManifestWithLines> {
    const container = await prisma.container.findUnique({
      where: { id: containerId },
      include: {
        parcels: true,
        departureAgency: { select: { city: true } },
        arrivalAgency: { select: { city: true } },
      },
    });

    if (!container) throw new NotFoundError('Conteneur', containerId);

    const count = await prisma.shippingManifest.count({
      where: { containerId, type: 'RECEPTION' },
    });

    const manifest = await prisma.shippingManifest.create({
      data: {
        containerId,
        number: `BRD-RECV-${count + 1}`,
        type: 'RECEPTION',
        status: 'ACTIVE',
        lines: {
          create: container.parcels.map((parcel) => ({
            parcelId: parcel.id,
            designation: parcel.designation,
            weight: parcel.weight,
            origin: parcel.origin || container.departureAgency.city,
            destination: parcel.destination || container.arrivalAgency.city,
            transit: container.arrivalAgency.city,
            price: parcel.price,
            status: parcel.status,
          })),
        },
      },
      include: MANIFEST_INCLUDE,
    });

    return manifest as ManifestWithLines;
  }

  async getComparison(containerId: string): Promise<ManifestComparison> {
    const dispatches = await prisma.shippingManifest.findMany({
      where: { containerId, type: 'DISPATCH', status: 'ACTIVE' },
      include: { lines: true },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });

    const receptions = await prisma.shippingManifest.findMany({
      where: { containerId, type: 'RECEPTION', status: 'ACTIVE' },
      include: { lines: true },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });

    const dispatchLines = dispatches[0]?.lines ?? [];
    const receptionLines = receptions[0]?.lines ?? [];

    const dispatchParcelIds = new Set(dispatchLines.map((l) => l.parcelId));
    const receptionParcelIds = new Set(receptionLines.map((l) => l.parcelId));

    const missing = [...dispatchParcelIds].filter((id) => !receptionParcelIds.has(id));
    const extra = [...receptionParcelIds].filter((id) => !dispatchParcelIds.has(id));

    return {
      dispatch: dispatchLines,
      reception: receptionLines,
      missing,
      extra,
    };
  }
}
