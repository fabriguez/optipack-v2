import { inject, injectable } from 'tsyringe';
import { CASH_REGISTER_REPOSITORY, type ICashRegisterRepository } from '../../interfaces/ICashRegisterRepository';
import { BusinessError } from '../../../domain/errors/BusinessError';
import { eventBus, DomainEvents } from '../../../infrastructure/events/EventBus';
import { DailyReportService } from '../../services/DailyReportService';

@injectable()
export class CloseCashRegisterUseCase {
  constructor(
    @inject(CASH_REGISTER_REPOSITORY) private cashRegisterRepo: ICashRegisterRepository,
    private reportService: DailyReportService,
  ) {}

  async execute(agencyId: string, userId: string, notes?: string) {
    const register = await this.cashRegisterRepo.findOrCreateForToday(agencyId);

    if (register.isClosed) {
      throw new BusinessError('La caisse du jour est deja cloturee');
    }

    const closed = await this.cashRegisterRepo.update(register.id, {
      isClosed: true,
      closedAt: new Date(),
      closedBy: { connect: { id: userId } },
      closingBalance: register.currentBalance,
      notes: notes ?? null,
    });

    // Generation du rapport journalier
    try {
      await this.reportService.generate(agencyId, register.date);
    } catch {
      // Best-effort
    }

    eventBus.emit({
      type: DomainEvents.CASH_REGISTER_CLOSED,
      payload: {
        registerId: register.id,
        agencyId,
        closingBalance: Number(register.currentBalance),
      },
      timestamp: new Date(),
      userId,
    });

    return closed;
  }
}
