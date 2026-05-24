import { inject, injectable } from 'tsyringe';
import { generateReference } from '@transitsoftservices/shared';
import { DISBURSEMENT_REPOSITORY, type IDisbursementRepository } from '../../interfaces/IDisbursementRepository';
import { CASH_REGISTER_REPOSITORY, type ICashRegisterRepository } from '../../interfaces/ICashRegisterRepository';
import { JOURNAL_ENTRY_REPOSITORY, type IJournalEntryRepository } from '../../interfaces/IJournalEntryRepository';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';
import { eventBus, DomainEvents } from '../../../infrastructure/events/EventBus';

@injectable()
export class VoidDisbursementUseCase {
  constructor(
    @inject(DISBURSEMENT_REPOSITORY) private disbursementRepo: IDisbursementRepository,
    @inject(CASH_REGISTER_REPOSITORY) private cashRegisterRepo: ICashRegisterRepository,
    @inject(JOURNAL_ENTRY_REPOSITORY) private journalRepo: IJournalEntryRepository,
  ) {}

  async execute(id: string, reason: string, userId: string) {
    const disbursement = await this.disbursementRepo.findById(id);
    if (!disbursement) throw new NotFoundError('Bon de decaissement', id);
    if (disbursement.isVoided) throw new BusinessError('Ce bon est deja annule');

    // Create reverse disbursement entry
    const reverseRef = generateReference('DEC-ANN', Date.now() % 10000);
    const reverse = await this.disbursementRepo.create({
      reference: reverseRef,
      reason: `Annulation: ${reason}`,
      description: `Annulation du bon ${disbursement.reference}`,
      orderer: disbursement.orderer,
      amount: Number(disbursement.amount),
      amountInWords: disbursement.amountInWords,
      agency: { connect: { id: disbursement.agencyId } },
      cashRegister: { connect: { id: disbursement.cashRegisterId } },
      issuedBy: { connect: { id: userId } },
      isVoided: true,
      voidReason: 'Ecriture inverse automatique',
    });

    // Void original
    await this.disbursementRepo.void(id, reason, reverse.id);

    // Re-credit cash register
    const cashRegister = await this.cashRegisterRepo.findOrCreateForToday(disbursement.agencyId);
    await this.cashRegisterRepo.addEntry(cashRegister.id, Number(disbursement.amount));

    // Reverse journal entry
    const journalCount = await this.journalRepo.countByDate(disbursement.agencyId, new Date());
    await this.journalRepo.create({
      reference: generateReference('JRN', Date.now()),
      description: `Annulation decaissement ${disbursement.reference}`,
      sourceType: 'DISBURSEMENT',
      sourceId: reverse.id,
      agency: { connect: { id: disbursement.agencyId } },
      createdBy: { connect: { id: userId } },
      lines: {
        create: [
          {
            debitAccount: { connect: { code: '101000' } },
            debitAmount: Number(disbursement.amount),
            creditAmount: 0,
            description: `Re-credit caisse - annulation ${disbursement.reference}`,
          },
          {
            creditAccount: { connect: { code: '701000' } },
            debitAmount: 0,
            creditAmount: Number(disbursement.amount),
            description: `Annulation charge ${disbursement.reference}`,
          },
        ],
      },
    });

    eventBus.emit({
      type: DomainEvents.DISBURSEMENT_VOIDED,
      payload: { disbursementId: id, amount: Number(disbursement.amount), reason },
      timestamp: new Date(),
      userId,
    });

    return { id, voided: true, reverseEntryId: reverse.id, reason };
  }
}
