import { inject, injectable } from 'tsyringe';
import { PENALTY_GRACE_DAYS } from '@optipack/shared';
import { PENALTY_REPOSITORY, type IPenaltyRepository } from '../../interfaces/IPenaltyRepository';
import { eventBus, DomainEvents } from '../../../infrastructure/events/EventBus';
import { prisma } from '../../../config/database';
import { createChildLogger } from '../../../config/logger';

const logger = createChildLogger('PenaltyCalculation');

@injectable()
export class CalculatePenaltiesUseCase {
  constructor(
    @inject(PENALTY_REPOSITORY) private penaltyRepo: IPenaltyRepository,
  ) {}

  async execute() {
    const eligible = await this.penaltyRepo.findParcelsEligibleForPenalty(PENALTY_GRACE_DAYS);
    let created = 0;
    let updated = 0;

    for (const { parcelId, clientId, agencyId, arrivalDate } of eligible) {
      const daysElapsed = Math.floor(
        (Date.now() - arrivalDate.getTime()) / (1000 * 60 * 60 * 24),
      );
      const penaltyDays = daysElapsed - PENALTY_GRACE_DAYS;
      if (penaltyDays <= 0) continue;

      // Get daily rate from system config or default
      const config = await prisma.systemConfig.findUnique({
        where: { organizationId_key: { organizationId: '00000000-0000-4000-a000-000000000001', key: 'penalty_daily_rate' } },
      });
      const dailyRate = config ? parseFloat(config.value) : 500;
      const totalAmount = penaltyDays * dailyRate;

      // Check if penalty already exists
      const existing = await this.penaltyRepo.findByParcel(parcelId);

      if (existing) {
        await this.penaltyRepo.update(existing.id, {
          daysAccumulated: penaltyDays,
          totalAmount,
        });
        updated++;
      } else {
        await this.penaltyRepo.create({
          startDate: arrivalDate,
          dailyRate,
          daysAccumulated: penaltyDays,
          totalAmount,
          parcel: { connect: { id: parcelId } },
          agency: { connect: { id: agencyId } },
          client: { connect: { id: clientId } },
        });
        created++;

        eventBus.emit({
          type: DomainEvents.PENALTY_APPLIED,
          payload: { parcelId, clientId, agencyId, amount: totalAmount, days: penaltyDays },
          timestamp: new Date(),
        });
      }
    }

    logger.info({ created, updated, total: eligible.length }, 'Penalty calculation completed');
    return { created, updated, totalProcessed: eligible.length };
  }
}
