import { inject, injectable } from 'tsyringe';
import type { CreateParcelInput } from '@transitsoftservices/shared';
import { generateTrackingNumber, generateReference } from '@transitsoftservices/shared';
import { PARCEL_REPOSITORY, type IParcelRepository } from '../../interfaces/IParcelRepository';
import { CLIENT_REPOSITORY, type IClientRepository } from '../../interfaces/IClientRepository';
import { WAREHOUSE_REPOSITORY, type IWarehouseRepository } from '../../interfaces/IWarehouseRepository';
import { TRANSIT_ROUTE_REPOSITORY, type ITransitRouteRepository } from '../../interfaces/ITransitRouteRepository';
import { INVOICE_REPOSITORY, type IInvoiceRepository } from '../../interfaces/IInvoiceRepository';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';
import { PricingService } from '../../services/PricingService';
import { HistoryService } from '../../services/HistoryService';
import { StorageChargeService } from '../../services/StorageChargeService';
import { eventBus, DomainEvents } from '../../../infrastructure/events/EventBus';
import { prisma } from '../../../config/database';

@injectable()
export class CreateParcelUseCase {
  constructor(
    @inject(PARCEL_REPOSITORY) private parcelRepo: IParcelRepository,
    @inject(CLIENT_REPOSITORY) private clientRepo: IClientRepository,
    @inject(WAREHOUSE_REPOSITORY) private warehouseRepo: IWarehouseRepository,
    @inject(TRANSIT_ROUTE_REPOSITORY) private transitRepo: ITransitRouteRepository,
    @inject(INVOICE_REPOSITORY) private invoiceRepo: IInvoiceRepository,
    private history: HistoryService,
    private storageCharges: StorageChargeService,
  ) {}

  async execute(input: CreateParcelInput, userId: string) {
    const [client, warehouse, transitRoute, destinationAgency] = await Promise.all([
      this.clientRepo.findById(input.clientId),
      this.warehouseRepo.findById(input.warehouseId),
      this.transitRepo.findById(input.transitRouteId),
      prisma.agency.findUnique({
        where: { id: input.destinationAgencyId },
        select: { id: true, name: true, city: true },
      }),
    ]);

    if (!client) throw new NotFoundError('Client', input.clientId);
    if (!warehouse) throw new NotFoundError('Magasin', input.warehouseId);
    if (!transitRoute) throw new NotFoundError('Route de transit', input.transitRouteId);
    if (!destinationAgency) throw new NotFoundError('Agence de destination', input.destinationAgencyId);

    // Blocage nouvelle expedition si le client a un cumul de dettes CLIENT
    // au-dessus du plafond configure. Lecture SystemConfig clé
    // 'debt_shipment_block_enabled' + 'debt_shipment_block_threshold'.
    // Par defaut desactive (back-compat).
    const orgForClient = await prisma.agency.findUnique({
      where: { id: warehouse.agencyId },
      select: { organizationId: true },
    });
    if (orgForClient) {
      const [enabledCfg, thresholdCfg] = await Promise.all([
        prisma.systemConfig.findUnique({
          where: { organizationId_key: { organizationId: orgForClient.organizationId, key: 'debt_shipment_block_enabled' } },
        }),
        prisma.systemConfig.findUnique({
          where: { organizationId_key: { organizationId: orgForClient.organizationId, key: 'debt_shipment_block_threshold' } },
        }),
      ]);
      if (enabledCfg?.value === 'true') {
        const threshold = Number(thresholdCfg?.value ?? 0);
        const agg = await prisma.debt.aggregate({
          where: {
            clientId: client.id,
            type: 'CLIENT',
            status: { notIn: ['CLEARED' as never, 'CANCELLED' as never] },
          },
          _sum: { remainingAmount: true },
        });
        const cumul = Number(agg._sum.remainingAmount ?? 0);
        if (cumul > threshold) {
          throw new BusinessError(
            `Nouvelle expedition refusee : ${client.fullName} a un cumul de dettes impayees de ${cumul} (plafond ${threshold}). Apurer la dette pour debloquer.`,
          );
        }
      }
    }

    // Regle stricte par type de transit :
    //   AIR  -> masse obligatoire, volume force a null
    //   SEA  -> volume obligatoire, masse forcee a null
    //   LAND -> les deux obligatoires
    const wIn = input.weight !== undefined && input.weight !== null && Number(input.weight) > 0;
    const vIn = input.volume !== undefined && input.volume !== null && Number(input.volume) > 0;
    let hasWeight = false;
    let hasVolume = false;
    if (transitRoute.type === 'AIR') {
      if (!wIn) throw new BusinessError('Route aerienne : la masse est obligatoire.');
      hasWeight = true; hasVolume = false;
    } else if (transitRoute.type === 'SEA') {
      if (!vIn) throw new BusinessError('Route maritime : le volume est obligatoire.');
      hasWeight = false; hasVolume = true;
    } else if (transitRoute.type === 'LAND') {
      if (!wIn || !vIn) throw new BusinessError('Route terrestre : masse et volume obligatoires.');
      hasWeight = true; hasVolume = true;
    }
    // destination = ville de l'agence d'arrivee (compat ascendante avec les
    // anciens consommateurs : PDFs, manifests, routings).
    const derivedDestination = destinationAgency.city;

    // Tarification : prix specifique partenaire si defini
    const partnerPricing = await prisma.partnerPricing.findFirst({
      where: {
        clientId: client.id,
        isActive: true,
        OR: [{ transitRouteId: transitRoute.id }, { transitRouteId: null }],
      },
      orderBy: { transitRouteId: 'desc' }, // priorise la regle specifique au route
    });

    // On passe le PartnerPricing brut au service pour qu'il enregistre la
    // source du tarif dans le breakdown (au lieu de masquer l'override en
    // remplacant les champs du transitRoute -- comme avant -- ce qui rendait
    // le breakdown opaque).
    const pricing = PricingService.calculate(
      hasWeight ? Number(input.weight) : 0,
      hasVolume ? Number(input.volume) : undefined,
      transitRoute,
      client,
      partnerPricing,
    );

    const trackingNumber = generateTrackingNumber();

    // Race-safe : si la reference est deja prise (countByDate non-atomique),
    // on retente jusqu'a 5x avec un compteur incremente. Au-dela on suffix random.
    let invoiceCount = await this.invoiceRepo.countByDate(warehouse.agencyId, new Date());
    let invoice;
    for (let attempt = 0; attempt < 5; attempt++) {
      const ref = generateReference('FAC', invoiceCount + 1 + attempt);
      try {
        invoice = await this.invoiceRepo.create({
          reference: ref,
          totalAmount: pricing.basePrice,
          discount: pricing.discountAmount,
          tva: 0,
          netAmount: pricing.finalPrice,
          paidAmount: 0,
          balance: pricing.finalPrice,
          client: { connect: { id: client.id } },
          agency: { connect: { id: warehouse.agencyId } },
        });
        break;
      } catch (err: unknown) {
        const code = (err as { code?: string })?.code;
        if (code !== 'P2002') throw err;
        // Re-fetch et boucle
        invoiceCount = await this.invoiceRepo.countByDate(warehouse.agencyId, new Date());
      }
    }
    if (!invoice) {
      // Fallback : reference avec suffix random pour garantir l'unicite
      const fallback = `${generateReference('FAC', invoiceCount + 1)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      invoice = await this.invoiceRepo.create({
        reference: fallback,
        totalAmount: pricing.basePrice,
        discount: pricing.discountAmount,
        tva: 0,
        netAmount: pricing.finalPrice,
        paidAmount: 0,
        balance: pricing.finalPrice,
        client: { connect: { id: client.id } },
        agency: { connect: { id: warehouse.agencyId } },
      });
    }

    // Emit invoice.created for notification flows
    try {
      eventBus.emit({
        type: DomainEvents.INVOICE_CREATED,
        payload: {
          invoiceId: invoice.id,
          reference: invoice.reference,
          clientId: invoice.clientId,
          agencyId: invoice.agencyId,
          organizationId: client.organizationId,
          totalAmount: invoice.totalAmount,
          currency: (invoice as any).currency ?? 'XAF',
        },
        timestamp: new Date(),
      });
    } catch (e) {
      // non blocking
    }

    const parcel = await this.parcelRepo.create({
      organizationId: client.organizationId,
      trackingNumber,
      trackingFournisseur: input.trackingFournisseur || null,
      designation: input.designation,
      weight: hasWeight ? Number(input.weight) : null,
      originalWeight: hasWeight ? Number(input.weight) : null,
      volume: hasVolume ? Number(input.volume) : null,
      destination: derivedDestination,
      destinationAgency: { connect: { id: destinationAgency.id } },
      destinationAddress: input.destinationAddress ?? null,
      // Audit fix #10 : categorie + flags
      category: (input.category as never) ?? 'STANDARD',
      isFragile: input.isFragile ?? false,
      isHazardous: input.isHazardous ?? false,
      declaredValue: input.declaredValue ?? null,
      observation: input.observation || null,
      originalObservation: input.observation || null,
      price: pricing.finalPrice,
      // Snapshot du calcul (transparence + audit). Reproduit la formule UI :
      // "120 kg x 12000 FCFA/kg = 1 440 000 FCFA" sans avoir besoin de
      // recalculer cote serveur a chaque consultation.
      pricingBreakdown: pricing.breakdown as never,
      status: 'IN_STOCK',
      isPresent: true,
      warehouseEnteredAt: new Date(),
      client: { connect: { id: input.clientId } },
      ...(input.recipientId && { recipient: { connect: { id: input.recipientId } } }),
      warehouse: { connect: { id: input.warehouseId } },
      originalWarehouse: { connect: { id: input.warehouseId } },
      transitRoute: { connect: { id: input.transitRouteId } },
      invoice: { connect: { id: invoice.id } },
    });

    // Ouvre charge de magasinage initiale (phase DEPARTURE, avec grace
    // period du magasin d'entree). Si la regle ne s'applique pas (rate 0
    // ou pas de regle), la charge est skippee.
    await this.storageCharges.openCharge({
      parcelId: parcel.id,
      warehouseId: input.warehouseId,
      phase: 'DEPARTURE',
    });

    // Historique de creation
    await this.history.recordParcel({
      parcelId: parcel.id,
      action: 'CREATED',
      statusAfter: 'IN_STOCK',
      isPresentAfter: true,
      warehouseId: input.warehouseId,
      transitRouteId: input.transitRouteId,
      userId,
      parcelDesignationSnapshot: parcel.designation,
      parcelTrackingSnapshot: parcel.trackingNumber,
      comment: 'Colis cree et enregistre en magasin',
      metadata: {
        invoiceId: invoice.id,
        invoiceRef: invoice.reference,
        price: pricing.finalPrice.toString(),
        weight: hasWeight ? Number(input.weight) : null,
        volume: hasVolume ? Number(input.volume) : null,
        partnerPricingApplied: !!partnerPricing,
      },
    });

    eventBus.emit({
      type: DomainEvents.PARCEL_CREATED,
      payload: {
        parcelId: parcel.id,
        trackingNumber,
        clientId: client.id,
        organizationId: client.organizationId,
        // Enrichi pour les templates email/notification : sans ces champs, le
        // mail "Colis enregistre" affichait des cellules vides (designation,
        // destination, masse). agencyId remplace l'ancien warehouseId (qui
        // pointait deja sur l'agence -- naming corrige).
        agencyId: warehouse.agencyId,
        designation: parcel.designation,
        destination: derivedDestination,
        weight: hasWeight ? Number(input.weight) : null,
        volume: hasVolume ? Number(input.volume) : null,
        // Type route pour adapter l'unite affichee dans le mail (AIR=kg,
        // SEA=m3, LAND=les deux).
        transitType: transitRoute.type,
        invoiceId: invoice.id,
        price: pricing.finalPrice,
      },
      timestamp: new Date(),
      userId,
    });

    return {
      ...parcel,
      invoice: { id: invoice.id, reference: invoice.reference, status: invoice.status },
      pricing,
    };
  }
}
