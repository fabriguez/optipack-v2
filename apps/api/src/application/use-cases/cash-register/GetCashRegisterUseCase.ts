import { inject, injectable } from 'tsyringe';
import { prisma } from '../../../config/database';
import { CASH_REGISTER_REPOSITORY, type ICashRegisterRepository } from '../../interfaces/ICashRegisterRepository';

@injectable()
export class GetCashRegisterUseCase {
  constructor(
    @inject(CASH_REGISTER_REPOSITORY) private cashRegisterRepo: ICashRegisterRepository,
  ) {}

  async execute(agencyId: string, date?: string) {
    if (date) {
      const day = new Date(date);
      day.setUTCHours(0, 0, 0, 0);
      const next = new Date(day);
      next.setUTCDate(next.getUTCDate() + 1);
      const found = await prisma.agencyCashRegister.findFirst({
        where: { agencyId, date: { gte: day, lt: next } },
      });
      return found; // peut etre null = pas de caisse pour ce jour
    }
    return this.cashRegisterRepo.findOrCreateForToday(agencyId);
  }
}
