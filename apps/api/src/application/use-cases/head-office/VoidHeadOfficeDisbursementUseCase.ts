import { inject, injectable } from 'tsyringe';
import { HEAD_OFFICE_CASH_REGISTER_REPOSITORY, type IHeadOfficeCashRegisterRepository } from '../../interfaces/IHeadOfficeCashRegisterRepository';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';
import { eventBus, DomainEvents } from '../../../infrastructure/events/EventBus';
import { prisma } from '../../../config/database';

@injectable()
export class VoidHeadOfficeDisbursementUseCase {
  constructor(
    @inject(HEAD_OFFICE_CASH_REGISTER_REPOSITORY) private hqRegisterRepo: IHeadOfficeCashRegisterRepository,
  ) {}

  async execute(id: string, reason: string, userId: string, organizationId: string) {
    const disbursement = await prisma.headOfficeDisbursementVoucher.findUnique({ where: { id } });
    if (!disbursement || disbursement.organizationId !== organizationId) {
      throw new NotFoundError('Bon de decaissement siege', id);
    }
    if (disbursement.isVoided) throw new BusinessError('Ce bon est deja annule.');

    const amount = Number(disbursement.amount);

    const voided = await prisma.$transaction(async (tx) => {
      const updated = await tx.headOfficeDisbursementVoucher.update({
        where: { id },
        data: { isVoided: true, voidedAt: new Date(), voidReason: reason },
      });

      await tx.headOfficeCashRegister.update({
        where: { id: disbursement.headOfficeCashRegisterId },
        data: {
          totalEntries: { increment: amount },
          currentBalance: { increment: amount },
        },
      });

      return updated;
    });

    eventBus.emit({
      type: DomainEvents.DISBURSEMENT_VOIDED,
      payload: { disbursementId: id, amount, reason, scope: 'HEAD_OFFICE' },
      timestamp: new Date(),
      userId,
    });

    return voided;
  }
}
