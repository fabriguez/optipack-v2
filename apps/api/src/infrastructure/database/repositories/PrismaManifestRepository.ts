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
import { safeOrderBy } from '../../../domain/utils/safeOrderBy';

// Colonnes scalaires triables (allowlist anti sort-injection).
const MANIFEST_SORTABLE = [
  'id',
  'number',
  'type',
  'status',
  'closedAt',
  'createdAt',
  'updatedAt',
];

const MANIFEST_INCLUDE = {
  lines: { orderBy: { addedAt: 'asc' as const } },
  container: { select: { id: true, designation: true, status: true } },
};

// Statuts autorises pour generer un bordereau (audit fix #3 : statuts simplifies).
const DISPATCH_ALLOWED = new Set(['LOADING', 'IN_TRANSIT', 'RECEIVED', 'UNLOADED']);
// Bordereau de reception (= livraison physique a destination). Autorise des
// que le conteneur est RECEIVED (arrive a destination, dechargement en
// cours) ou UNLOADED (tous les colis traites). Sinon impossible de generer
// le bordereau quand certains colis ont ete marques "non recus" sans aller
// jusqu'au dechargement complet -- le statut RECEIVED reste alors actif et
// bloquait la generation.
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
    filters: { containerId?: string; type?: string; status?: string; scopeWhere?: object | null },
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
      // Scope agence : merge en AND pour ne pas ecraser l'OR de recherche.
      ...(filters.scopeWhere && { AND: [filters.scopeWhere as Prisma.ShippingManifestWhereInput] }),
    };

    const [data, total] = await Promise.all([
      prisma.shippingManifest.findMany({
        where,
        skip,
        take: limit,
        orderBy: safeOrderBy(sortBy, sortOrder, MANIFEST_SORTABLE, 'createdAt'),
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
    const container = await this.loadContainerForManifest(containerId);

    if (!DISPATCH_ALLOWED.has(container.status)) {
      throw new BusinessError(
        `Bordereau d'envoi indisponible : le conteneur doit avoir ete charge (statut actuel : ${container.status}).`,
      );
    }

    // Cherche les colis lies a ce conteneur soit comme actuels (containerId)
    // soit comme provenance (lastContainerId, set au dechargement). Permet
    // de regenerer un bordereau d'envoi apres reception/dechargement,
    // sinon il n'y a plus de colis "currentContainerId" et la requete
    // retourne vide.
    const parcels = await this.loadParcelsWithFinancials(
      { OR: [{ containerId }, { lastContainerId: containerId }] },
      container.departureAgency.city,
      container.arrivalAgency.city,
    );

    if (parcels.length === 0) {
      throw new BusinessError("Impossible de generer un bordereau d'envoi pour un conteneur vide.");
    }

    const number = await this.buildManifestName(container, 'DISPATCH');

    const manifest = await prisma.shippingManifest.create({
      data: {
        containerId,
        number,
        type: 'DISPATCH',
        status: 'ACTIVE',
        lines: { create: parcels },
      },
      include: MANIFEST_INCLUDE,
    });

    return manifest as ManifestWithLines;
  }

  async createReceptionManifest(containerId: string, _userId: string): Promise<ManifestWithLines> {
    const container = await this.loadContainerForManifest(containerId);

    if (!RECEPTION_ALLOWED.has(container.status)) {
      throw new BusinessError(
        `Bordereau de reception indisponible : le conteneur doit etre RECEIVED ou UNLOADED (statut actuel : ${container.status}).`,
      );
    }

    // Bordereau de reception = colis EFFECTIVEMENT DECHARGES de ce conteneur.
    // Marqueur de "decharge" : lastContainerId == containerId (pose au
    // dechargement) ET le colis n'est plus charge dans CE conteneur
    // (containerId != containerId, ou null). LOST exclus : ils figurent
    // dans le bordereau de comparaison (manquants physiques).
    // Generation MANUELLE uniquement (declenchee par l'utilisateur depuis
    // l'UI), pas d'auto a l'arrivee : le user genere quand le dechargement
    // est suffisant a ses yeux.
    const parcels = await this.loadParcelsWithFinancials(
      {
        lastContainerId: containerId,
        OR: [{ containerId: null }, { containerId: { not: containerId } }],
        status: { not: 'LOST' as never },
      },
      container.departureAgency.city,
      container.arrivalAgency.city,
    );

    if (parcels.length === 0) {
      throw new BusinessError("Aucun colis decharge pour ce conteneur. Dechargez au moins un colis avant de generer le bordereau de reception.");
    }

    const number = await this.buildManifestName(container, 'RECEPTION');

    const manifest = await prisma.shippingManifest.create({
      data: {
        containerId,
        number,
        type: 'RECEPTION',
        status: 'ACTIVE',
        lines: { create: parcels },
      },
      include: MANIFEST_INCLUDE,
    });

    return manifest as ManifestWithLines;
  }

  // Charge les donnees container necessaires au nommage et snapshot
  private async loadContainerForManifest(containerId: string) {
    const container = await prisma.container.findUnique({
      where: { id: containerId },
      include: {
        departureAgency: { select: { id: true, name: true, city: true } },
        arrivalAgency: { select: { id: true, name: true, city: true } },
        parentContainer: { select: { id: true, designation: true } },
        transitRoute: { select: { id: true, name: true } },
      },
    });
    if (!container) throw new NotFoundError('Conteneur', containerId);
    return container;
  }

  /**
   * Charge les colis matchant `where` avec donnees financieres et client/recipient,
   * puis transforme chaque colis en ligne de bordereau avec snapshot (designation,
   * tracking, client, destinataire, ville, masse/volume, montant, avance, reste).
   *
   * Probleme : une facture peut couvrir N colis (audit fix #5). On repartit donc
   * le `paidAmount` et le `balance` de la facture proportionnellement au prix
   * de chaque colis dans la facture.
   */
  private async loadParcelsWithFinancials(
    where: Prisma.ParcelWhereInput,
    departureCity: string,
    arrivalCity: string,
  ) {
    const parcels = await prisma.parcel.findMany({
      where: { ...where, isDeleted: false },
      orderBy: { trackingNumber: 'asc' },
      include: {
        client: { select: { fullName: true, phone: true, email: true } },
        recipient: { select: { fullName: true, phone: true, email: true } },
        destinationAgency: { select: { city: true } },
        // Route de transit propre au colis : peut differer de la route du
        // conteneur (multi-tronçons, re-routages). Snapshote dans le
        // bordereau pour tracer la route effective au moment de l'envoi.
        transitRoute: { select: { name: true } },
        invoice: {
          select: {
            id: true,
            totalAmount: true,
            paidAmount: true,
            balance: true,
          },
        },
      },
    });

    // Pre-aggreger : pour chaque facture, somme des prix des colis qu'on emet
    // afin de repartir l'avance proportionnellement au sein du bordereau.
    const invoiceParcelsTotal = new Map<string, number>();
    for (const p of parcels) {
      if (!p.invoiceId) continue;
      invoiceParcelsTotal.set(
        p.invoiceId,
        (invoiceParcelsTotal.get(p.invoiceId) ?? 0) + Number(p.price),
      );
    }

    return parcels.map((parcel) => {
      const price = Number(parcel.price);
      let advance = 0;
      let balance = price;
      let invoiceTotal: number | null = null;

      if (parcel.invoice) {
        invoiceTotal = Number(parcel.invoice.totalAmount);
        const invTotalPrice = invoiceParcelsTotal.get(parcel.invoiceId!) ?? price;
        const ratio = invTotalPrice > 0 ? price / invTotalPrice : 0;
        advance = Number(parcel.invoice.paidAmount) * ratio;
        balance = Math.max(0, price - advance);
      }

      return {
        parcelId: parcel.id,
        trackingNumber: parcel.trackingNumber,
        designation: parcel.designation,
        clientName: parcel.client?.fullName ?? null,
        clientPhone: parcel.client?.phone ?? null,
        clientEmail: parcel.client?.email ?? null,
        recipientName: parcel.recipient?.fullName ?? null,
        recipientPhone: parcel.recipient?.phone ?? null,
        recipientEmail: parcel.recipient?.email ?? null,
        destinationCity: parcel.destinationAgency?.city ?? parcel.destination ?? null,
        weight: parcel.weight ?? null,
        volume: parcel.volume ?? null,
        origin: parcel.origin || departureCity,
        destination: parcel.destination || arrivalCity,
        // Priorite : route de transit propre au colis (s'il en a une), sinon
        // ville d'arrivee du conteneur en fallback.
        transit: parcel.transitRoute?.name || arrivalCity,
        price: parcel.price,
        invoiceTotal,
        advanceAmount: Number(advance.toFixed(2)),
        balanceAmount: Number(balance.toFixed(2)),
        status: parcel.status,
      };
    });
  }

  /**
   * Construit le nom du bordereau selon la convention :
   * "Bordereau <reception|envoi> - <Ville> - <ParentName> - <ChildName> - <Carrier>"
   * - Ville = ville d'arrivee (= ville de reception)
   * - ChildName = designation du conteneur courant
   * - ParentName = designation du conteneur parent si dispo, sinon "-"
   * - Carrier = transporteur si renseigne, sinon "-"
   * Garantit l'unicite : si le nom existe deja on suffixe par #2, #3, ...
   */
  private async buildManifestName(
    container: {
      designation: string;
      carrier?: string | null;
      arrivalAgency: { city: string };
      parentContainer: { designation: string } | null;
    },
    type: 'DISPATCH' | 'RECEPTION',
  ): Promise<string> {
    const typeLabel = type === 'DISPATCH' ? 'envoi' : 'reception';
    const ville = container.arrivalAgency.city;
    const parentName = container.parentContainer?.designation ?? '-';
    const childName = container.designation;
    const carrier = (container.carrier?.trim() || '-');

    const base = `Bordereau ${typeLabel} - ${ville} - ${parentName} - ${childName} - ${carrier}`;

    let candidate = base;
    let suffix = 2;
    while (await prisma.shippingManifest.findUnique({ where: { number: candidate } })) {
      candidate = `${base} #${suffix++}`;
      if (suffix > 999) {
        // garde-fou : suffix timestamp
        candidate = `${base} #${Date.now().toString().slice(-6)}`;
        break;
      }
    }
    return candidate;
  }

  async getComparison(containerId: string): Promise<ManifestComparison> {
    const [dispatches, receptions, discrepancies, linkedParcels] = await Promise.all([
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
      // Colis lies en ligne a ce conteneur : actuellement (containerId) OU
      // historiquement (lastContainerId, apres dechargement). Sert a detecter
      // les colis "ghost" : presents en base, lies au conteneur, mais ABSENTS
      // du bordereau d'envoi -- typique d'un manifeste genere avant le
      // chargement effectif ou d'un ajout manuel apres coup.
      prisma.parcel.findMany({
        where: {
          isDeleted: false,
          OR: [{ containerId }, { lastContainerId: containerId }],
        },
        select: { id: true },
      }),
    ]);

    const dispatchLines = dispatches[0]?.lines ?? [];
    const receptionLines = receptions[0]?.lines ?? [];

    const dispatchParcelIds = new Set(dispatchLines.map((l) => l.parcelId).filter(Boolean) as string[]);
    const receptionParcelIds = new Set(receptionLines.map((l) => l.parcelId).filter(Boolean) as string[]);
    const linkedParcelIds = new Set(linkedParcels.map((p) => p.id));

    const missingParcelIds = [...dispatchParcelIds].filter((id) => !receptionParcelIds.has(id));
    const extraParcelIds = [...receptionParcelIds].filter((id) => !dispatchParcelIds.has(id));
    // outOfManifest : colis lie en ligne au conteneur mais absent du dispatch.
    // Inclut implicitement les "extras" trouves a la reception qui n'etaient
    // pas dans le dispatch -- au choix de l'UI de les dedoublonner.
    const outOfManifestParcelIds = [...linkedParcelIds].filter((id) => !dispatchParcelIds.has(id));

    return {
      dispatch: dispatchLines,
      reception: receptionLines,
      missingParcelIds,
      extraParcelIds,
      outOfManifestParcelIds,
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

}
