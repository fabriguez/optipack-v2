import { inject, injectable } from 'tsyringe';
import { generateReference } from '@transitsoftservices/shared';
import { FUND_TRANSFER_REPOSITORY, type IFundTransferRepository } from '../../interfaces/IFundTransferRepository';
import { CASH_REGISTER_REPOSITORY, type ICashRegisterRepository } from '../../interfaces/ICashRegisterRepository';
import { HEAD_OFFICE_CASH_REGISTER_REPOSITORY, type IHeadOfficeCashRegisterRepository } from '../../interfaces/IHeadOfficeCashRegisterRepository';
import { JOURNAL_ENTRY_REPOSITORY, type IJournalEntryRepository } from '../../interfaces/IJournalEntryRepository';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';
import { assertAgencyActive } from '../../services/scope/agencyScope';
import { eventBus, DomainEvents } from '../../../infrastructure/events/EventBus';
import { prisma } from '../../../config/database';

@injectable()
export class VoidFundTransferUseCase {
  constructor(
    @inject(FUND_TRANSFER_REPOSITORY) private transferRepo: IFundTransferRepository,
    @inject(CASH_REGISTER_REPOSITORY) private cashRegisterRepo: ICashRegisterRepository,
    @inject(HEAD_OFFICE_CASH_REGISTER_REPOSITORY) private hqRegisterRepo: IHeadOfficeCashRegisterRepository,
    @inject(JOURNAL_ENTRY_REPOSITORY) private journalRepo: IJournalEntryRepository,
  ) {}

  async execute(id: string, reason: string, userId: string) {
    const transfer = await this.transferRepo.findById(id);
    if (!transfer) throw new NotFoundError('Transfert de fonds', id);
    if (transfer.isVoided) throw new BusinessError('Ce transfert est deja annule');

    // Agence source OU destination desactivee : annulation gelee (409).
    // Les deux ids sont nullables (transfert depuis/vers le siege) -> skip si absent.
    if (transfer.sourceAgencyId) await assertAgencyActive(transfer.sourceAgencyId);
    if (transfer.destinationAgencyId) await assertAgencyActive(transfer.destinationAgencyId);

    const amount = Number(transfer.amount);
    const wasConfirmed = transfer.status === 'CONFIRMED';

    const voided = await this.transferRepo.update(id, {
      isVoided: true,
      voidedAt: new Date(),
      voidReason: reason,
      status: 'VOIDED',
    });

    // 1. Re-credit la source (toujours debitee a la creation).
    if (transfer.sourceType === 'HQ' && transfer.sourceOrganizationId) {
      const hqRegister = await this.hqRegisterRepo.findOrCreate(transfer.sourceOrganizationId);
      await this.hqRegisterRepo.addEntry(hqRegister.id, amount);
    } else if (transfer.sourceAgencyId) {
      const cashRegister = await this.cashRegisterRepo.findOrCreateForToday(transfer.sourceAgencyId);
      await this.cashRegisterRepo.addEntry(cashRegister.id, amount);
    }

    // 2. Annule l'effet cote destination si la confirmation l'avait deja credite.
    if (wasConfirmed) {
      if (transfer.destinationType === 'HQ' && transfer.sourceAgencyId) {
        const sourceAgency = await prisma.agency.findUnique({
          where: { id: transfer.sourceAgencyId },
          select: { organizationId: true },
        });
        if (sourceAgency) {
          const hqRegister = await this.hqRegisterRepo.findOrCreate(sourceAgency.organizationId);
          await this.hqRegisterRepo.addExit(hqRegister.id, amount);
        }
      } else if (transfer.destinationType === 'AGENCY' && transfer.destinationAgencyId) {
        const destRegister = await this.cashRegisterRepo.findOrCreateForToday(transfer.destinationAgencyId);
        await this.cashRegisterRepo.addExit(destRegister.id, amount);
      }
    }

    // 3. Journal comptable inverse (cote agence source seulement).
    if (transfer.sourceAgencyId) {
      const journalCount = await this.journalRepo.countByDate(transfer.sourceAgencyId, new Date());
      await this.journalRepo.create({
        reference: generateReference('JRN', Date.now()),
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
    }

    eventBus.emit({
      type: DomainEvents.FUND_TRANSFER_VOIDED,
      payload: { transferId: id, amount, reason },
      timestamp: new Date(),
      userId,
    });

    return voided;
  }
}
