import { inject, injectable } from 'tsyringe';
import type { CreateBatchParcelsInput } from '@transitsoftservices/shared';
import { generateTrackingNumber, generateReference } from '@transitsoftservices/shared';
import { PARCEL_REPOSITORY, type IParcelRepository } from '../../interfaces/IParcelRepository';
import { CLIENT_REPOSITORY, type IClientRepository } from '../../interfaces/IClientRepository';
import { WAREHOUSE_REPOSITORY, type IWarehouseRepository } from '../../interfaces/IWarehouseRepository';
import { TRANSIT_ROUTE_REPOSITORY, type ITransitRouteRepository } from '../../interfaces/ITransitRouteRepository';
import { INVOICE_REPOSITORY, type IInvoiceRepository } from '../../interfaces/IInvoiceRepository';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';
import { PricingService } from '../../services/PricingService';
import { HistoryService } from '../../services/HistoryService';
import { eventBus, DomainEvents } from '../../../infrastructure/events/EventBus';
import { prisma } from '../../../config/database';

/**
 * Audit fix #5 : creation N colis avec UNE seule facture qui les couvre tous.
 * Reduit le nombre de factures et de paiements a enregistrer pour les clients
 * qui envoient plusieurs colis dans une meme session.
 */
@injectable()
export class CreateBatchParcelsUseCase {
  constructor(
    @inject(PARCEL_REPOSITORY) private parcelRepo: IParcelRepository,
    @inject(CLIENT_REPOSITORY) private clientRepo: IClientRepository,
    @inject(WAREHOUSE_REPOSITORY) private warehouseRepo: IWarehouseRepository,
    @inject(TRANSIT_ROUTE_REPOSITORY) private transitRepo: ITransitRouteRepository,
    @inject(INVOICE_REPOSITORY) private invoiceRepo: IInvoiceRepository,
    private history: HistoryService,
  ) {}

  async execute(input: CreateBatchParcelsInput, userId: string) {
    if (input.parcels.length === 0) {
      throw new BusinessError('Au moins un colis requis');
    }

    const [client, warehouse, transitRoute] = await Promise.all([
      this.clientRepo.findById(input.clientId),
      this.warehouseRepo.findById(input.warehouseId),
      this.transitRepo.findById(input.transitRouteId),
    ]);

    if (!client) throw new NotFoundError('Client', input.clientId);
    if (!warehouse) throw new NotFoundError('Magasin', input.warehouseId);
    if (!transitRoute) throw new NotFoundError('Route de transit', input.transitRouteId);

    // Pre-charge toutes les agences referencees pour deriver "destination"
    // (ville) en un seul aller-retour DB.
    const agencyIds = Array.from(new Set(input.parcels.map((p) => p.destinationAgencyId)));
    const agencies = await prisma.agency.findMany({
      where: { id: { in: agencyIds } },
      select: { id: true, city: true },
    });
    const agencyById = new Map(agencies.map((a) => [a.id, a]));
    for (const id of agencyIds) {
      if (!agencyById.has(id)) throw new NotFoundError('Agence de destination', id);
    }

    // Tarification : prix specifique partenaire si defini
    const partnerPricing = await prisma.partnerPricing.findFirst({
      where: {
        clientId: client.id,
        isActive: true,
        OR: [{ transitRouteId: transitRoute.id }, { transitRouteId: null }],
      },
      orderBy: { transitRouteId: 'desc' },
    });

    // Calcul du prix par colis (le partnerPricing est passe au service pour
    // qu'il soit trace dans le breakdown du colis).
    const computed = input.parcels.map((p) => {
      const hasWeight = p.weight !== undefined && p.weight !== null && Number(p.weight) > 0;
      const hasVolume = p.volume !== undefined && p.volume !== null && Number(p.volume) > 0;
      if (!hasWeight && !hasVolume) {
        throw new BusinessError(`Le colis "${p.designation}" doit avoir une masse ou un volume`);
      }
      const pricing = PricingService.calculate(
        hasWeight ? Number(p.weight) : 0,
        hasVolume ? Number(p.volume) : undefined,
        transitRoute,
        client,
        partnerPricing,
      );
      return { ...p, hasWeight, hasVolume, pricing };
    });

    const totalBase = computed.reduce((s, c) => s + c.pricing.basePrice, 0);
    const totalDiscount = computed.reduce((s, c) => s + c.pricing.discountAmount, 0);
    const totalNet = computed.reduce((s, c) => s + c.pricing.finalPrice, 0);

    // 1 facture pour tout le batch
    const invoiceCount = await this.invoiceRepo.countByDate(warehouse.agencyId, new Date());
    const invoiceRef = generateReference('FAC', invoiceCount + 1);

    const invoice = await this.invoiceRepo.create({
      reference: invoiceRef,
      totalAmount: totalBase,
      discount: totalDiscount,
      tva: 0,
      netAmount: totalNet,
      paidAmount: 0,
      balance: totalNet,
      client: { connect: { id: client.id } },
      agency: { connect: { id: warehouse.agencyId } },
    });

    // Emit invoice.created so notification handlers can act (client + admins)
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

    // Creation des colis attaches a cette facture
    const created = [];
    for (const p of computed) {
      const trackingNumber = generateTrackingNumber();
      const agency = agencyById.get(p.destinationAgencyId)!;
      const parcel = await this.parcelRepo.create({
        organizationId: client.organizationId,
        trackingNumber,
        trackingFournisseur: (p as any).trackingFournisseur || null,
        designation: p.designation,
        weight: p.hasWeight ? Number(p.weight) : null,
        originalWeight: p.hasWeight ? Number(p.weight) : null,
        volume: p.hasVolume ? Number(p.volume) : null,
        destination: agency.city,
        destinationAgency: { connect: { id: agency.id } },
        destinationAddress: p.destinationAddress ?? null,
        category: (p.category as never) ?? 'STANDARD',
        isFragile: p.isFragile ?? false,
        isHazardous: p.isHazardous ?? false,
        declaredValue: p.declaredValue ?? null,
        observation: p.observation || null,
        originalObservation: p.observation || null,
        price: p.pricing.finalPrice,
        pricingBreakdown: p.pricing.breakdown as never,
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
        comment: `Colis cree (batch facture ${invoiceRef})`,
        metadata: {
          batch: true,
          invoiceId: invoice.id,
          batchSize: input.parcels.length,
        },
      });

      eventBus.emit({
        type: DomainEvents.PARCEL_CREATED,
        payload: {
          parcelId: parcel.id,
          trackingNumber,
          clientId: client.id,
          organizationId: client.organizationId,
          // Idem CreateParcelUseCase : payload enrichi pour les templates.
          agencyId: warehouse.agencyId,
          designation: parcel.designation,
          destination: agency.city,
          weight: p.hasWeight ? Number(p.weight) : null,
          volume: p.hasVolume ? Number(p.volume) : null,
          transitType: transitRoute.type,
          invoiceId: invoice.id,
          price: p.pricing.finalPrice,
        },
        timestamp: new Date(),
        userId,
      });

      created.push(parcel);
    }

    return {
      invoice: {
        id: invoice.id,
        reference: invoice.reference,
        netAmount: totalNet,
        parcelCount: created.length,
      },
      parcels: created,
    };
  }
}
