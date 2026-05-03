import { inject, injectable } from 'tsyringe';
import { CONTAINER_REPOSITORY, type IContainerRepository } from '../../interfaces/IContainerRepository';
import { NotFoundError } from '../../../domain/errors/BusinessError';
import { prisma } from '../../../config/database';

interface LoadableParcelsFilters {
  search?: string;
  page?: number;
  limit?: number;
}

@injectable()
export class ListLoadableParcelsUseCase {
  constructor(
    @inject(CONTAINER_REPOSITORY) private containerRepo: IContainerRepository,
  ) {}

  async execute(containerId: string, filters: LoadableParcelsFilters = {}) {
    const c = await this.containerRepo.findById(containerId);
    if (!c) throw new NotFoundError('Conteneur', containerId);

    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
    const skip = (page - 1) * limit;

    // Regles d'eligibilite
    // - colis en stock et present physiquement
    // - destination != agence de depart du conteneur (sinon erreur metier : deja sur place)
    // - meme magasin/agence : on ne charge que des colis presents dans une agence accessible
    //   au conteneur. On considere ici l'agence de depart du conteneur.
    // - type compatible (air/sea) sauf conteneur d'acheminement
    const where: any = {
      isDeleted: false,
      status: 'IN_STOCK',
      isPresent: true,
      // colis qui se trouvent physiquement dans une agence == agence de depart du conteneur
      warehouse: { agencyId: c.departureAgencyId },
      // exclure ceux dont la destination finale = agence de depart
      NOT: { destinationAgencyId: c.departureAgencyId },
    };

    if (!c.isForwarding) {
      where.transitRoute = { type: c.type };
      // Refus marchandise dangereuse en aerien
      if (c.type === 'AIR') {
        where.isHazardous = false;
      }
    }

    if (filters.search) {
      where.OR = [
        { trackingNumber: { contains: filters.search, mode: 'insensitive' } },
        { designation: { contains: filters.search, mode: 'insensitive' } },
        { client: { fullName: { contains: filters.search, mode: 'insensitive' } } },
      ];
    }

    // Tri : on charge d'abord les colis dont la facture est PAYEE.
    // Pour les non-payes, du plus ancien en stock au plus recent.
    // Prisma ne supporte pas un orderBy conditionnel sur invoice.status,
    // donc on recupere le set candidat (cap a 500 pour borner) et on ordonne en memoire.
    const HARD_CAP = 500;
    const [rows, total] = await Promise.all([
      prisma.parcel.findMany({
        where,
        take: HARD_CAP,
        include: {
          client: { select: { id: true, fullName: true, phone: true } },
          recipient: { select: { id: true, fullName: true, phone: true } },
          warehouse: { select: { id: true, name: true } },
          transitRoute: { select: { id: true, name: true, type: true } },
          invoice: {
            select: {
              id: true,
              reference: true,
              status: true,
              totalAmount: true,
              paidAmount: true,
              balance: true,
            },
          },
          destinationAgency: { select: { id: true, name: true, city: true } },
        },
      }),
      prisma.parcel.count({ where }),
    ]);

    const ranked = rows
      .map((p) => {
        const invoiceStatus = p.invoice?.status ?? 'UNPAID';
        const isPaid = invoiceStatus === 'PAID';
        const sortDate = p.warehouseEnteredAt ?? p.createdAt;
        return { p, isPaid, sortDate };
      })
      .sort((a, b) => {
        if (a.isPaid !== b.isPaid) return a.isPaid ? -1 : 1; // payes d'abord
        // au sein du meme bucket, plus ancien d'abord
        return a.sortDate.getTime() - b.sortDate.getTime();
      })
      .slice(skip, skip + limit)
      .map(({ p }) => p);

    return {
      data: ranked,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}
