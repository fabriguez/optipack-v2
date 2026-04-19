import { inject, injectable } from 'tsyringe';
import { VALID_PARCEL_TRANSITIONS } from '@transitsoftservices/shared';
import { PARCEL_REPOSITORY, type IParcelRepository } from '../../interfaces/IParcelRepository';
import { NotFoundError, InvalidStatusTransitionError } from '../../../domain/errors/BusinessError';
import { eventBus, DomainEvents } from '../../../infrastructure/events/EventBus';
import { prisma } from '../../../config/database';

@injectable()
export class UpdateParcelStatusUseCase {
  constructor(
    @inject(PARCEL_REPOSITORY) private parcelRepo: IParcelRepository,
  ) {}

  async execute(
    parcelId: string,
    newStatus: string,
    userId: string,
    warehouseChange?: { warehouseId: string | null },
  ) {
    const parcel = await this.parcelRepo.findById(parcelId);
    if (!parcel) {
      throw new NotFoundError('Colis', parcelId);
    }

    const oldStatus = parcel.status;
    const isStatusChange = newStatus !== oldStatus;
    const isWarehouseChange =
      warehouseChange !== undefined && warehouseChange.warehouseId !== parcel.warehouseId;

    // Validate transition only when status actually changes
    if (isStatusChange) {
      const validTransitions = VALID_PARCEL_TRANSITIONS[parcel.status] || [];
      if (!validTransitions.includes(newStatus)) {
        throw new InvalidStatusTransitionError('Colis', parcel.status, newStatus);
      }
    }

    // Apply status-specific logic
    const updateData: Record<string, any> = { status: newStatus };

    if (newStatus === 'DELIVERED') {
      updateData.pickupDate = new Date();
      updateData.isPresent = false;
    }

    if (newStatus === 'ARRIVED') {
      updateData.arrivalDate = new Date();
      updateData.penaltyStartDate = new Date();
    }

    if (isWarehouseChange) {
      const targetWarehouseId = warehouseChange!.warehouseId;
      updateData.warehouse = targetWarehouseId
        ? { connect: { id: targetWarehouseId } }
        : { disconnect: true };
      updateData.warehouseEnteredAt = targetWarehouseId ? new Date() : null;
    }

    const updated = await this.parcelRepo.update(parcelId, updateData);

    // Create history entry
    const action = isStatusChange
      ? `STATUS_CHANGE_${newStatus}`
      : isWarehouseChange
        ? warehouseChange!.warehouseId
          ? 'WAREHOUSE_TRANSFER'
          : 'WAREHOUSE_REMOVE'
        : `STATUS_CHANGE_${newStatus}`;

    await prisma.parcelHistory.create({
      data: {
        parcelId,
        action,
        statusBefore: oldStatus,
        statusAfter: newStatus,
        warehouseId: isWarehouseChange ? warehouseChange!.warehouseId : parcel.warehouseId,
        userId,
        actorType: 'USER',
        parcelDesignationSnapshot: parcel.designation,
        parcelTrackingSnapshot: parcel.trackingNumber,
      },
    });

    // Emit event
    eventBus.emit({
      type: DomainEvents.PARCEL_STATUS_CHANGED,
      payload: { parcelId, oldStatus, newStatus, trackingNumber: parcel.trackingNumber },
      timestamp: new Date(),
      userId,
    });

    return updated;
  }
}
