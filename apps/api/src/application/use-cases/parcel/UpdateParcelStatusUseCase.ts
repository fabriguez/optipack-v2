import { inject, injectable } from 'tsyringe';
import { VALID_PARCEL_TRANSITIONS } from '@optipack/shared';
import { PARCEL_REPOSITORY, type IParcelRepository } from '../../interfaces/IParcelRepository';
import { NotFoundError, InvalidStatusTransitionError } from '../../../domain/errors/BusinessError';
import { eventBus, DomainEvents } from '../../../infrastructure/events/EventBus';
import { prisma } from '../../../config/database';

@injectable()
export class UpdateParcelStatusUseCase {
  constructor(
    @inject(PARCEL_REPOSITORY) private parcelRepo: IParcelRepository,
  ) {}

  async execute(parcelId: string, newStatus: string, userId: string) {
    const parcel = await this.parcelRepo.findById(parcelId);
    if (!parcel) {
      throw new NotFoundError('Colis', parcelId);
    }

    // Validate transition
    const validTransitions = VALID_PARCEL_TRANSITIONS[parcel.status] || [];
    if (!validTransitions.includes(newStatus)) {
      throw new InvalidStatusTransitionError('Colis', parcel.status, newStatus);
    }

    const oldStatus = parcel.status;

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

    const updated = await this.parcelRepo.update(parcelId, updateData);

    // Create history entry
    await prisma.parcelHistory.create({
      data: {
        parcelId,
        action: `STATUS_CHANGE_${newStatus}`,
        statusBefore: oldStatus,
        statusAfter: newStatus,
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
