import { EventEmitter } from 'events';
import { createChildLogger } from '../../config/logger';

const logger = createChildLogger('EventBus');

export interface DomainEvent {
  type: string;
  payload: Record<string, unknown>;
  timestamp: Date;
  userId?: string;
  agencyId?: string;
}

type EventHandler = (event: DomainEvent) => Promise<void>;

class EventBusImpl {
  private emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(50);
  }

  emit(event: DomainEvent): void {
    logger.debug({ type: event.type }, 'Domain event emitted');
    this.emitter.emit(event.type, event);
  }

  on(eventType: string, handler: EventHandler): void {
    this.emitter.on(eventType, async (event: DomainEvent) => {
      try {
        await handler(event);
      } catch (err) {
        logger.error({ err, eventType }, 'Event handler failed');
      }
    });
    logger.debug({ eventType }, 'Event handler registered');
  }

  off(eventType: string, handler: EventHandler): void {
    this.emitter.off(eventType, handler);
  }

  removeAllListeners(eventType?: string): void {
    this.emitter.removeAllListeners(eventType);
  }
}

export const eventBus = new EventBusImpl();

// Domain event types
export const DomainEvents = {
  PARCEL_CREATED: 'parcel.created',
  PARCEL_STATUS_CHANGED: 'parcel.statusChanged',
  PARCEL_LOADED: 'parcel.loaded',
  PARCEL_UNLOADED: 'parcel.unloaded',
  PARCEL_DELIVERED: 'parcel.delivered',
  // ETA conteneur depassee : colis encore en transit apres la date d'arrivee
  // estimee. Emis par le cron de detection de retard.
  PARCEL_DELAYED: 'parcel.delayed',
  // Ouverture d'une charge de magasinage facturable (rate > 0). Emis par
  // StorageChargeService.openCharge.
  STORAGE_CHARGE_STARTED: 'storageCharge.started',

  CONTAINER_CREATED: 'container.created',
  CONTAINER_STATUS_CHANGED: 'container.statusChanged',
  CONTAINER_DEPARTED: 'container.departed',
  CONTAINER_ARRIVED: 'container.arrived',

  INVOICE_CREATED: 'invoice.created',
  INVOICE_PAID: 'invoice.paid',

  PAYMENT_RECEIVED: 'payment.received',
  PAYMENT_VOIDED: 'payment.voided',

  DISBURSEMENT_CREATED: 'disbursement.created',
  DISBURSEMENT_VOIDED: 'disbursement.voided',

  FUND_TRANSFER_CREATED: 'fundTransfer.created',
  FUND_TRANSFER_CONFIRMED: 'fundTransfer.confirmed',
  FUND_TRANSFER_VOIDED: 'fundTransfer.voided',

  CASH_REGISTER_UPDATED: 'cashRegister.updated',
  CASH_REGISTER_CLOSED: 'cashRegister.closed',

  PENALTY_APPLIED: 'penalty.applied',

  CLIENT_LOYALTY_UPDATED: 'client.loyaltyUpdated',

  NOTIFICATION_SEND: 'notification.send',

  
} as const;
