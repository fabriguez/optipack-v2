import { injectable } from 'tsyringe';
import type { ManifestDiscrepancy, Prisma } from '@prisma/client';
import type {
  IManifestRepository,
  ManifestWithLines,
  ManifestComparison,
  DiscrepancyInput,
} from '../../../application/interfaces/IManifestRepository';
import type { PaginationInput, PaginatedResponse } from '@transitsoftservices/shared';
import { prisma } from '../../../config/database';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';

const MANIFEST_INCLUDE = {
  lines: { orderBy: { addedAt: 'asc' as const } },
  container: { select: { id: true, designation: true, status: true } },
};

// Statuts autorises pour generer un bordereau (audit fix #3 : statuts simplifies).
const DISPATCH_ALLOWED = new Set(['LOADING', 'IN_TRANSIT', 'RECEIVED', 'UNLOADED']);
const RECEPTION_ALLOWED = new Set(['RECEIVED', 'UNLOADED']);

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
      ...(filters.type && { type: filters.type as never }),
      ...(filters.status && { status: filters.status as never }),
      ...(search && {
        OR: [{ number: { contains: search, mode: 'insensitive' } }],
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
        parcels: { include: { client: { select: { fullName: true } } } },
        departureAgency: { select: { city: true } },
        arrivalAgency: { select: { city: true } },
      },
    });

    if (!container) throw new NotFoundError('Conteneur', containerId);

    if (!DISPATCH_ALLOWED.has(container.status)) {
      throw new BusinessError(
        `Bordereau d'envoi indisponible : le conteneur doit avoir ete charge (statut actuel : ${container.status}).`,
      );
    }

    if (container.parcels.length === 0) {
      throw new BusinessError("Impossible de generer un bordereau d'envoi pour un conteneur vide.");
    }

    const number = await this.generateUniqueNumber('BRD-DISP');

    const manifest = await prisma.shippingManifest.create({
      data: {
        containerId,
        number,
        type: 'DISPATCH',
        status: 'ACTIVE',
        lines: {
          create: container.parcels.map((parcel) => ({
            parcelId: parcel.id,
            designation: parcel.designation,
            weight: parcel.weight ?? null,
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
    // Le bordereau de reception inclut TOUS les colis qui ont transite par ce conteneur,
    // y compris ceux qui en ont ete decharges (donc sans containerId courant).
    const container = await prisma.container.findUnique({
      where: { id: containerId },
      include: {
        departureAgency: { select: { city: true } },
        arrivalAgency: { select: { city: true } },
      },
    });

    if (!container) throw new NotFoundError('Conteneur', containerId);

    if (!RECEPTION_ALLOWED.has(container.status)) {
      throw new BusinessError(
        `Bordereau de reception indisponible : le conteneur doit etre arrive ou decharge (statut actuel : ${container.status}).`,
      );
    }

    const parcels = await prisma.parcel.findMany({
      where: {
        OR: [{ containerId }, { lastContainerId: containerId }],
      },
      orderBy: { trackingNumber: 'asc' },
    });

    if (parcels.length === 0) {
      throw new BusinessError("Aucun colis n'a transite par ce conteneur.");
    }

    const number = await this.generateUniqueNumber('BRD-RECV');

    const manifest = await prisma.shippingManifest.create({
      data: {
        containerId,
        number,
        type: 'RECEPTION',
        status: 'ACTIVE',
        lines: {
          create: parcels.map((parcel) => ({
            parcelId: parcel.id,
            designation: parcel.designation,
            weight: parcel.weight ?? null,
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
    const [dispatches, receptions, discrepancies] = await Promise.all([
      prisma.shippingManifest.findMany({
        where: { containerId, type: 'DISPATCH', status: 'ACTIVE' },
        include: { lines: true },
        orderBy: { createdAt: 'desc' },
        take: 1,
      }),
      prisma.shippingManifest.findMany({
        where: { containerId, type: 'RECEPTION', status: 'ACTIVE' },
        include: { lines: true },
        orderBy: { createdAt: 'desc' },
        take: 1,
      }),
      prisma.manifestDiscrepancy.findMany({
        where: { containerId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const dispatchLines = dispatches[0]?.lines ?? [];
    const receptionLines = receptions[0]?.lines ?? [];

    const dispatchParcelIds = new Set(dispatchLines.map((l) => l.parcelId).filter(Boolean) as string[]);
    const receptionParcelIds = new Set(receptionLines.map((l) => l.parcelId).filter(Boolean) as string[]);

    const missingParcelIds = [...dispatchParcelIds].filter((id) => !receptionParcelIds.has(id));
    const extraParcelIds = [...receptionParcelIds].filter((id) => !dispatchParcelIds.has(id));

    return {
      dispatch: dispatchLines,
      reception: receptionLines,
      missingParcelIds,
      extraParcelIds,
      discrepancies,
    };
  }

  async addDiscrepancy(input: DiscrepancyInput): Promise<ManifestDiscrepancy> {
    return prisma.manifestDiscrepancy.create({
      data: {
        containerId: input.containerId,
        parcelId: input.parcelId ?? null,
        type: input.type as never,
        designation: input.designation ?? null,
        trackingNumber: input.trackingNumber ?? null,
        weight: input.weight ?? null,
        comment: input.comment ?? null,
        markedByUserId: input.markedByUserId ?? null,
      },
    });
  }

  async removeDiscrepancy(id: string): Promise<void> {
    await prisma.manifestDiscrepancy.delete({ where: { id } });
  }

  async listDiscrepancies(containerId: string): Promise<ManifestDiscrepancy[]> {
    return prisma.manifestDiscrepancy.findMany({
      where: { containerId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Genere un numero de bordereau unique GLOBALEMENT.
   * Format : <prefix>-<YYMM>-<seq>
   * Le seq est calcule a partir du nombre total de bordereaux du mois.
   */
  private async generateUniqueNumber(prefix: string): Promise<string> {
    const now = new Date();
    const yymm = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    let attempt = 0;
    while (attempt < 5) {
      const count = await prisma.shippingManifest.count({
        where: {
          number: { startsWith: `${prefix}-${yymm}-` },
          createdAt: { gte: startOfMonth },
        },
      });
      const candidate = `${prefix}-${yymm}-${String(count + 1 + attempt).padStart(4, '0')}`;
      const existing = await prisma.shippingManifest.findUnique({ where: { number: candidate } });
      if (!existing) return candidate;
      attempt += 1;
    }
    // Fallback : suffix avec timestamp pour garantir l'unicite
    return `${prefix}-${yymm}-${Date.now().toString().slice(-6)}`;
  }
}
