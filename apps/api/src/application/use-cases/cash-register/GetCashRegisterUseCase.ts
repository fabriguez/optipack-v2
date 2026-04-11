import { inject, injectable } from 'tsyringe';
import { CASH_REGISTER_REPOSITORY, type ICashRegisterRepository } from '../../interfaces/ICashRegisterRepository';

@injectable()
export class GetCashRegisterUseCase {
  constructor(
    @inject(CASH_REGISTER_REPOSITORY) private cashRegisterRepo: ICashRegisterRepository,
  ) {}

  async execute(agencyId: string) {
    return this.cashRegisterRepo.findOrCreateForToday(agencyId);
  }
}
