import { inject, injectable } from 'tsyringe';
import type { CreateFundTransferInput } from '@transitsoftservices/shared';
import { generateReference } from '@transitsoftservices/shared';
import { FUND_TRANSFER_REPOSITORY, type IFundTransferRepository } from '../../interfaces/IFundTransferRepository';
import { CASH_REGISTER_REPOSITORY, type ICashRegisterRepository } from '../../interfaces/ICashRegisterRepository';
import { HEAD_OFFICE_CASH_REGISTER_REPOSITORY, type IHeadOfficeCashRegisterRepository } from '../../interfaces/IHeadOfficeCashRegisterRepository';
import { JOURNAL_ENTRY_REPOSITORY, type IJournalEntryRepository } from '../../interfaces/IJournalEntryRepository';
import { InsufficientBalanceError, BusinessError } from '../../../domain/errors/BusinessError';
import { eventBus, DomainEvents } from '../../../infrastructure/events/EventBus';

@injectable()
export class CreateFundTransferUseCase {
  constructor(
    @inject(FUND_TRANSFER_REPOSITORY) private transferRepo: IFundTransferRepository,
    @inject(CASH_REGISTER_REPOSITORY) private cashRegisterRepo: ICashRegisterRepository,
    @inject(HEAD_OFFICE_CASH_REGISTER_REPOSITORY) private hqRegisterRepo: IHeadOfficeCashRegisterRepository,
    @inject(JOURNAL_ENTRY_REPOSITORY) private journalRepo: IJournalEntryRepository,
  ) {}

  async execute(input: CreateFundTransferInput, userId: string) {
    const sourceType = input.sourceType ?? 'AGENCY';

    // Validation source : agence => sourceAgencyId, HQ => sourceOrganizationId.
    if (sourceType === 'AGENCY' && !input.sourceAgencyId) {
      throw new BusinessError("sourceAgencyId requis pour un transfert depuis une agence.");
    }
    if (sourceType === 'HQ' && !input.sourceOrganizationId) {
      throw new BusinessError("sourceOrganizationId requis pour un transfert depuis le siege.");
    }
    // Pas de HQ -> HQ.
    if (sourceType === 'HQ' && input.destinationType === 'HQ') {
      throw new BusinessError("Un transfert siege -> siege n'est pas autorise.");
    }

    const reference = generateReference('TRF', Date.now() % 10000);

    if (sourceType === 'HQ') {
      // Source siege : debit immediat du registre siege.
      const hqRegister = await this.hqRegisterRepo.findOrCreate(input.sourceOrganizationId!);
      const available = Number(hqRegister.currentBalance);
      if (input.amount > available) {
        throw new InsufficientBalanceError(input.amount, available);
      }

      const transfer = await this.transferRepo.create({
        reference,
        amount: input.amount,
        transferMethod: input.transferMethod,
        sourceType: 'HQ',
        ...(input.sourcePaymentMethod && { sourcePaymentMethod: input.sourcePaymentMethod }),
        ...(input.destinationPaymentMethod && { destinationPaymentMethod: input.destinationPaymentMethod }),
        destinationType: input.destinationType,
        destinationLabel:
          input.destinationType === 'BANK' ? 'Banque' :
          input.destinationType === 'AGENCY' ? undefined : 'Siege',
        sourceOrganization: { connect: { id: input.sourceOrganizationId! } },
        initiatedBy: { connect: { id: userId } },
        ...(input.destinationId && input.destinationType === 'AGENCY' && {
          destinationAgency: { connect: { id: input.destinationId } },
        }),
      });

      await this.hqRegisterRepo.addExit(hqRegister.id, input.amount);

      eventBus.emit({
        type: DomainEvents.FUND_TRANSFER_CREATED,
        payload: { transferId: transfer.id, sourceOrganizationId: input.sourceOrganizationId, amount: input.amount },
        timestamp: new Date(),
        userId,
      });

      return transfer;
    }

    // Source agence : flux historique.
    const cashRegister = await this.cashRegisterRepo.findOrCreateForToday(input.sourceAgencyId!);
    const available = Number(cashRegister.currentBalance);
    if (input.amount > available) {
      throw new InsufficientBalanceError(input.amount, available);
    }

    const transfer = await this.transferRepo.create({
      reference,
      amount: input.amount,
      transferMethod: input.transferMethod,
      sourceType: 'AGENCY',
      ...(input.sourcePaymentMethod && { sourcePaymentMethod: input.sourcePaymentMethod }),
      ...(input.destinationPaymentMethod && { destinationPaymentMethod: input.destinationPaymentMethod }),
      destinationType: input.destinationType,
      destinationLabel: input.destinationType === 'HQ' ? 'Siege' : undefined,
      sourceAgency: { connect: { id: input.sourceAgencyId! } },
      initiatedBy: { connect: { id: userId } },
      ...(input.destinationId && input.destinationType === 'AGENCY' && {
        destinationAgency: { connect: { id: input.destinationId } },
      }),
    });

    await this.cashRegisterRepo.addExit(cashRegister.id, input.amount);

    const journalCount = await this.journalRepo.countByDate(input.sourceAgencyId!, new Date());
    await this.journalRepo.create({
      reference: generateReference('JRN', journalCount + 1),
      description: `Transfert ${reference} vers ${input.destinationType}`,
      sourceType: 'TRANSFER',
      sourceId: transfer.id,
      agency: { connect: { id: input.sourceAgencyId! } },
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
