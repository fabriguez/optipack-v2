import { inject, injectable } from 'tsyringe';
import { generateReference } from '@transitsoftservices/shared';
import { FUND_TRANSFER_REPOSITORY, type IFundTransferRepository } from '../../interfaces/IFundTransferRepository';
import { CASH_REGISTER_REPOSITORY, type ICashRegisterRepository } from '../../interfaces/ICashRegisterRepository';
import { JOURNAL_ENTRY_REPOSITORY, type IJournalEntryRepository } from '../../interfaces/IJournalEntryRepository';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';
import { eventBus, DomainEvents } from '../../../infrastructure/events/EventBus';

@injectable()
export class VoidFundTransferUseCase {
  constructor(
    @inject(FUND_TRANSFER_REPOSITORY) private transferRepo: IFundTransferRepository,
    @inject(CASH_REGISTER_REPOSITORY) private cashRegisterRepo: ICashRegisterRepository,
    @inject(JOURNAL_ENTRY_REPOSITORY) private journalRepo: IJournalEntryRepository,
  ) {}

  async execute(id: string, reason: string, userId: string) {
    const transfer = await this.transferRepo.findById(id);
    if (!transfer) throw new NotFoundError('Transfert de fonds', id);
    if (transfer.isVoided) throw new BusinessError('Ce transfert est deja annule');

    const amount = Number(transfer.amount);

    const voided = await this.transferRepo.update(id, {
      isVoided: true,
      voidedAt: new Date(),
      voidReason: reason,
      status: 'VOIDED',
    });

    // Re-credit source agency cash register
    const cashRegister = await this.cashRegisterRepo.findOrCreateForToday(transfer.sourceAgencyId);
    await this.cashRegisterRepo.addEntry(cashRegister.id, amount);

    // Reverse journal: Debit Caisse, Credit Banque/Siege
    const journalCount = await this.journalRepo.countByDate(transfer.sourceAgencyId, new Date());
    await this.journalRepo.create({
      reference: generateReference('JRN', journalCount + 1),
      description: `Annulation transfert ${transfer.reference}`,
      sourceType: 'TRANSFER',
      sourceId: transfer.id,
      agency: { connect: { id: transfer.sourceAgencyId } },
      createdBy: { connect: { id: userId } },
      lines: {
        create: [
          {
            debitAccount: { connect: { code: '101000' } },
            debitAmount: amount,
            creditAmount: 0,
            description: `Re-credit caisse - annulation ${transfer.reference}`,
          },
          {
            creditAccount: { connect: { code: '102000' } },
            debitAmount: 0,
            creditAmount: amount,
            description: `Annulation transfert ${transfer.reference}`,
          },
        ],
      },
    });

    eventBus.emit({
      type: DomainEvents.FUND_TRANSFER_VOIDED,
      payload: { transferId: id, amount, reason },
      timestamp: new Date(),
      userId,
    });

    return voided;
  }
}
