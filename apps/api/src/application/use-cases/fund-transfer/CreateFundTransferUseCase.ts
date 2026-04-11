import { inject, injectable } from 'tsyringe';
import type { CreateFundTransferInput } from '@optipack/shared';
import { generateReference } from '@optipack/shared';
import { FUND_TRANSFER_REPOSITORY, type IFundTransferRepository } from '../../interfaces/IFundTransferRepository';
import { CASH_REGISTER_REPOSITORY, type ICashRegisterRepository } from '../../interfaces/ICashRegisterRepository';
import { JOURNAL_ENTRY_REPOSITORY, type IJournalEntryRepository } from '../../interfaces/IJournalEntryRepository';
import { InsufficientBalanceError } from '../../../domain/errors/BusinessError';
import { eventBus, DomainEvents } from '../../../infrastructure/events/EventBus';

@injectable()
export class CreateFundTransferUseCase {
  constructor(
    @inject(FUND_TRANSFER_REPOSITORY) private transferRepo: IFundTransferRepository,
    @inject(CASH_REGISTER_REPOSITORY) private cashRegisterRepo: ICashRegisterRepository,
    @inject(JOURNAL_ENTRY_REPOSITORY) private journalRepo: IJournalEntryRepository,
  ) {}

  async execute(input: CreateFundTransferInput, userId: string) {
    // Check cash register balance
    const cashRegister = await this.cashRegisterRepo.findOrCreateForToday(input.sourceAgencyId);
    const available = Number(cashRegister.currentBalance);
    if (input.amount > available) {
      throw new InsufficientBalanceError(input.amount, available);
    }

    const reference = generateReference('TRF', Date.now() % 10000);

    const transfer = await this.transferRepo.create({
      reference,
      amount: input.amount,
      transferMethod: input.transferMethod,
      destinationType: input.destinationType,
      destinationLabel: input.destinationType === 'HQ' ? 'Siege' : undefined,
      sourceAgency: { connect: { id: input.sourceAgencyId } },
      initiatedBy: { connect: { id: userId } },
      ...(input.destinationId && input.destinationType === 'AGENCY' && {
        destinationAgency: { connect: { id: input.destinationId } },
      }),
    });

    // Deduct from source agency cash register
    await this.cashRegisterRepo.addExit(cashRegister.id, input.amount);

    // Journal: Debit Banque/Siege, Credit Caisse
    const journalCount = await this.journalRepo.countByDate(input.sourceAgencyId, new Date());
    await this.journalRepo.create({
      reference: generateReference('JRN', journalCount + 1),
      description: `Transfert ${reference} vers ${input.destinationType}`,
      sourceType: 'TRANSFER',
      sourceId: transfer.id,
      agency: { connect: { id: input.sourceAgencyId } },
      createdBy: { connect: { id: userId } },
      lines: {
        create: [
          {
            debitAccount: { connect: { code: '102000' } },
            debitAmount: input.amount,
            creditAmount: 0,
            description: `Transfert vers ${input.destinationType}`,
          },
          {
            creditAccount: { connect: { code: '101000' } },
            debitAmount: 0,
            creditAmount: input.amount,
            description: `Sortie caisse - transfert ${reference}`,
          },
        ],
      },
    });

    eventBus.emit({
      type: DomainEvents.FUND_TRANSFER_CREATED,
      payload: { transferId: transfer.id, sourceAgencyId: input.sourceAgencyId, amount: input.amount },
      timestamp: new Date(),
      userId,
    });

    return transfer;
  }
}
