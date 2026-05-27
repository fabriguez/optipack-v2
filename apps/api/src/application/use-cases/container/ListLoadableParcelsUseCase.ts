import { inject, injectable } from 'tsyringe';
import { CONTAINER_REPOSITORY, type IContainerRepository } from '../../interfaces/IContainerRepository';
import { NotFoundError } from '../../../domain/errors/BusinessError';
import { prisma } from '../../../config/database';

interface LoadableParcelsFilters {
  search?: string;
  page?: number;
  limit?: number;
  // Restriction optionnelle a un magasin source precis (au sein de l'agence
  // de depart). Permet a un magasinier d'isoler les colis presents dans son
  // magasin avant chargement, plutot que de scroller toute l'agence.
  warehouseId?: string;
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
      // Si un warehouseId est fourni, on restreint au magasin precis (cas
      // magasinier qui ne voit que son perimetre). On verifie quand meme que
      // ce magasin appartient bien a l'agence de depart pour eviter les
      // injections d'IDs hors scope.
      warehouse: filters.warehouseId
        ? { id: filters.warehouseId, agencyId: c.departureAgencyId }
        : { agencyId: c.departureAgencyId },
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

    // Tri : 1) montant paye descendant (les plus payes en premier),
    // 2) date d'enregistrement croissante (plus ancien d'abord). Permet de
    // prioriser les colis avec versement le plus eleve pour le chargement.
    const ranked = rows
      .map((p) => {
        const paidAmount = Number(p.invoice?.paidAmount ?? 0);
        const sortDate = p.warehouseEnteredAt ?? p.createdAt;
        return { p, paidAmount, sortDate };
      })
      .sort((a, b) => {
        if (a.paidAmount !== b.paidAmount) return b.paidAmount - a.paidAmount;
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
