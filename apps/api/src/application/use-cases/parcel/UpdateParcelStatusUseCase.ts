import { inject, injectable } from 'tsyringe';
import { VALID_PARCEL_TRANSITIONS } from '@transitsoftservices/shared';
import { PARCEL_REPOSITORY, type IParcelRepository } from '../../interfaces/IParcelRepository';
import { NotFoundError, InvalidStatusTransitionError } from '../../../domain/errors/BusinessError';
import { eventBus, DomainEvents } from '../../../infrastructure/events/EventBus';
import { HistoryService } from '../../services/HistoryService';

@injectable()
export class UpdateParcelStatusUseCase {
  constructor(
    @inject(PARCEL_REPOSITORY) private parcelRepo: IParcelRepository,
    private history: HistoryService,
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

    if (isStatusChange) {
      const validTransitions = VALID_PARCEL_TRANSITIONS[parcel.status] || [];
      if (!validTransitions.includes(newStatus)) {
        throw new InvalidStatusTransitionError('Colis', parcel.status, newStatus);
      }
    }

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

    const action = isStatusChange
      ? `STATUS_CHANGE_${newStatus}`
      : isWarehouseChange
        ? warehouseChange!.warehouseId
          ? 'WAREHOUSE_TRANSFER'
          : 'WAREHOUSE_REMOVE'
        : `STATUS_CHANGE_${newStatus}`;

    await this.history.recordParcel({
      parcelId,
      action,
      statusBefore: oldStatus,
      statusAfter: newStatus,
      warehouseId: isWarehouseChange ? warehouseChange!.warehouseId : parcel.warehouseId,
      userId,
      parcelDesignationSnapshot: parcel.designation,
      parcelTrackingSnapshot: parcel.trackingNumber,
    });

    eventBus.emit({
      type: DomainEvents.PARCEL_STATUS_CHANGED,
      payload: {
        parcelId,
        oldStatus,
        newStatus,
        trackingNumber: parcel.trackingNumber,
        // Champs requis par NotificationHandler pour resoudre destinataire +
        // remplir le template email (sinon : cellules vides).
        clientId: parcel.clientId,
        agencyId: (parcel as any).warehouse?.agencyId ?? (parcel as any).agencyId ?? null,
        organizationId: (parcel as any).organizationId ?? null,
        designation: parcel.designation,
      },
      timestamp: new Date(),
      userId,
    });

    return updated;
  }
}
