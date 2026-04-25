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
  ) {}

  async execute(input: CreateParcelInput, userId: string) {
    // Au moins l'un de masse OU volume doit etre fourni
    const hasWeight = input.weight !== undefined && input.weight !== null && Number(input.weight) > 0;
    const hasVolume = input.volume !== undefined && input.volume !== null && Number(input.volume) > 0;
    if (!hasWeight && !hasVolume) {
      throw new BusinessError('Le colis doit avoir une masse ou un volume');
    }

    const [client, warehouse, transitRoute] = await Promise.all([
      this.clientRepo.findById(input.clientId),
      this.warehouseRepo.findById(input.warehouseId),
      this.transitRepo.findById(input.transitRouteId),
    ]);

    if (!client) throw new NotFoundError('Client', input.clientId);
    if (!warehouse) throw new NotFoundError('Magasin', input.warehouseId);
    if (!transitRoute) throw new NotFoundError('Route de transit', input.transitRouteId);

    // Tarification : prix specifique partenaire si defini
    const partnerPricing = await prisma.partnerPricing.findFirst({
      where: {
        clientId: client.id,
        isActive: true,
        OR: [{ transitRouteId: transitRoute.id }, { transitRouteId: null }],
      },
      orderBy: { transitRouteId: 'desc' }, // priorise la regle specifique au route
    });

    const effectiveRoute = partnerPricing
      ? {
          ...transitRoute,
          pricePerKg: partnerPricing.pricePerKg,
          pricePerVolume: partnerPricing.pricePerVolume,
        }
      : transitRoute;

    const pricing = PricingService.calculate(
      hasWeight ? Number(input.weight) : 0,
      hasVolume ? Number(input.volume) : undefined,
      effectiveRoute,
      client,
    );

    const trackingNumber = generateTrackingNumber();

    const invoiceCount = await this.invoiceRepo.countByDate(warehouse.agencyId, new Date());
    const invoiceRef = generateReference('FAC', invoiceCount + 1);

    const invoice = await this.invoiceRepo.create({
      reference: invoiceRef,
      totalAmount: pricing.basePrice,
      discount: pricing.discountAmount,
      tva: 0,
      netAmount: pricing.finalPrice,
      paidAmount: 0,
      balance: pricing.finalPrice,
      client: { connect: { id: client.id } },
      agency: { connect: { id: warehouse.agencyId } },
    });

    const parcel = await this.parcelRepo.create({
      trackingNumber,
      designation: input.designation,
      weight: hasWeight ? Number(input.weight) : null,
      originalWeight: hasWeight ? Number(input.weight) : null,
      volume: hasVolume ? Number(input.volume) : null,
      destination: input.destination,
      observation: input.observation || null,
      originalObservation: input.observation || null,
      price: pricing.finalPrice,
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
        warehouseId: warehouse.agencyId,
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
