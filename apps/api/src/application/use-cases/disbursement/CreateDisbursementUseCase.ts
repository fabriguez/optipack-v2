import { inject, injectable } from 'tsyringe';
import type { CreateDisbursementInput } from '@transitsoftservices/shared';
import { generateReference } from '@transitsoftservices/shared';
import { DISBURSEMENT_REPOSITORY, type IDisbursementRepository } from '../../interfaces/IDisbursementRepository';
import { CASH_REGISTER_REPOSITORY, type ICashRegisterRepository } from '../../interfaces/ICashRegisterRepository';
import { JOURNAL_ENTRY_REPOSITORY, type IJournalEntryRepository } from '../../interfaces/IJournalEntryRepository';
import { InsufficientBalanceError } from '../../../domain/errors/BusinessError';
import { assertAgencyActive } from '../../services/scope/agencyScope';
import { eventBus, DomainEvents } from '../../../infrastructure/events/EventBus';

@injectable()
export class CreateDisbursementUseCase {
  constructor(
    @inject(DISBURSEMENT_REPOSITORY) private disbursementRepo: IDisbursementRepository,
    @inject(CASH_REGISTER_REPOSITORY) private cashRegisterRepo: ICashRegisterRepository,
    @inject(JOURNAL_ENTRY_REPOSITORY) private journalRepo: IJournalEntryRepository,
  ) {}

  async execute(input: CreateDisbursementInput, userId: string) {
    // Agence desactivee : aucun decaissement possible.
    await assertAgencyActive(input.agencyId);

    // 1. Get or create cash register
    const cashRegister = await this.cashRegisterRepo.findOrCreateForToday(input.agencyId);

    // 2. Check balance
    const available = Number(cashRegister.currentBalance);
    if (input.amount > available) {
      throw new InsufficientBalanceError(input.amount, available);
    }

    // 3. Create IMMUTABLE disbursement
    const reference = generateReference('DEC', Date.now() % 10000);

    const disbursement = await this.disbursementRepo.create({
      reference,
      reason: input.reason,
      description: input.description ?? null,
      orderer: input.orderer,
      amount: input.amount,
      amountInWords: input.amountInWords,
      // Nouveaux champs (cf. Phase Disbursement) : ordonnateur lie, justifs,
      // liens optionnels vers une entite metier (conteneur/colis/client).
      proofUrl: input.proofUrl ?? null,
      proofKey: input.proofKey ?? null,
      justificationDescription: input.justificationDescription ?? null,
      ...(input.ordererUserId
        ? { ordererUser: { connect: { id: input.ordererUserId } } }
        : {}),
      ...(input.containerId ? { container: { connect: { id: input.containerId } } } : {}),
      ...(input.parcelId ? { parcel: { connect: { id: input.parcelId } } } : {}),
      ...(input.clientId ? { client: { connect: { id: input.clientId } } } : {}),
      agency: { connect: { id: input.agencyId } },
      cashRegister: { connect: { id: cashRegister.id } },
      issuedBy: { connect: { id: userId } },
    });

    // 4. Deduct from cash register
    await this.cashRegisterRepo.addExit(cashRegister.id, input.amount);

    // 5. Journal entry: Debit Charges, Credit Caisse
    const journalCount = await this.journalRepo.countByDate(input.agencyId, new Date());
    const journalRef = generateReference('JRN', Date.now());

    await this.journalRepo.create({
      reference: journalRef,
      description: `Decaissement ${reference} - ${input.reason}`,
      sourceType: 'DISBURSEMENT',
      sourceId: disbursement.id,
      agency: { connect: { id: input.agencyId } },
      createdBy: { connect: { id: userId } },
      lines: {
        create: [
          {
            debitAccount: { connect: { code: '701000' } },
            debitAmount: input.amount,
            creditAmount: 0,
            description: `Decaissement: ${input.reason}`,
          },
          {
            creditAccount: { connect: { code: '101000' } },
            debitAmount: 0,
            creditAmount: input.amount,
            description: `Sortie caisse ${reference}`,
          },
        ],
      },
    });

    eventBus.emit({
      type: DomainEvents.DISBURSEMENT_CREATED,
      payload: { disbursementId: disbursement.id, agencyId: input.agencyId, amount: input.amount },
      timestamp: new Date(),
      userId,
    });

    return disbursement;
  }
}
