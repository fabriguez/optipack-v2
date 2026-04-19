import { inject, injectable } from 'tsyringe';
import type { CreateParcelInput } from '@transitsoftservices/shared';
import { generateTrackingNumber, generateReference } from '@transitsoftservices/shared';
import { PARCEL_REPOSITORY, type IParcelRepository } from '../../interfaces/IParcelRepository';
import { CLIENT_REPOSITORY, type IClientRepository } from '../../interfaces/IClientRepository';
import { WAREHOUSE_REPOSITORY, type IWarehouseRepository } from '../../interfaces/IWarehouseRepository';
import { TRANSIT_ROUTE_REPOSITORY, type ITransitRouteRepository } from '../../interfaces/ITransitRouteRepository';
import { INVOICE_REPOSITORY, type IInvoiceRepository } from '../../interfaces/IInvoiceRepository';
import { NotFoundError } from '../../../domain/errors/BusinessError';
import { PricingService } from '../../services/PricingService';
import { eventBus, DomainEvents } from '../../../infrastructure/events/EventBus';

@injectable()
export class CreateParcelUseCase {
  constructor(
    @inject(PARCEL_REPOSITORY) private parcelRepo: IParcelRepository,
    @inject(CLIENT_REPOSITORY) private clientRepo: IClientRepository,
    @inject(WAREHOUSE_REPOSITORY) private warehouseRepo: IWarehouseRepository,
    @inject(TRANSIT_ROUTE_REPOSITORY) private transitRepo: ITransitRouteRepository,
    @inject(INVOICE_REPOSITORY) private invoiceRepo: IInvoiceRepository,
  ) {}

  async execute(input: CreateParcelInput, userId: string) {
    // Validate relations
    const [client, warehouse, transitRoute] = await Promise.all([
      this.clientRepo.findById(input.clientId),
      this.warehouseRepo.findById(input.warehouseId),
      this.transitRepo.findById(input.transitRouteId),
    ]);

    if (!client) throw new NotFoundError('Client', input.clientId);
    if (!warehouse) throw new NotFoundError('Magasin', input.warehouseId);
    if (!transitRoute) throw new NotFoundError('Route de transit', input.transitRouteId);

    // Calculate price
    const pricing = PricingService.calculate(
      input.weight,
      input.volume,
      transitRoute,
      client,
    );

    // Generate tracking number
    const trackingNumber = generateTrackingNumber();

    // Create invoice first
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

    // Create parcel
    const parcel = await this.parcelRepo.create({
      trackingNumber,
      designation: input.designation,
      weight: input.weight,
      originalWeight: input.weight,
      volume: input.volume ?? null,
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

    // Emit domain event
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
