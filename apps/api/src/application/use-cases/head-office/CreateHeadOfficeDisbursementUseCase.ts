import { inject, injectable } from 'tsyringe';
import type { CreateHeadOfficeDisbursementInput } from '@transitsoftservices/shared';
import { generateReference } from '@transitsoftservices/shared';
import { HEAD_OFFICE_CASH_REGISTER_REPOSITORY, type IHeadOfficeCashRegisterRepository } from '../../interfaces/IHeadOfficeCashRegisterRepository';
import { InsufficientBalanceError } from '../../../domain/errors/BusinessError';
import { eventBus, DomainEvents } from '../../../infrastructure/events/EventBus';
import { prisma } from '../../../config/database';

@injectable()
export class CreateHeadOfficeDisbursementUseCase {
  constructor(
    @inject(HEAD_OFFICE_CASH_REGISTER_REPOSITORY) private hqRegisterRepo: IHeadOfficeCashRegisterRepository,
  ) {}

  async execute(input: CreateHeadOfficeDisbursementInput, userId: string) {
    const hqRegister = await this.hqRegisterRepo.findOrCreate(input.organizationId);
    const available = Number(hqRegister.currentBalance);
    if (input.amount > available) {
      throw new InsufficientBalanceError(input.amount, available);
    }

    const reference = generateReference('DEC-HQ', Date.now() % 10000);

    const result = await prisma.$transaction(async (tx) => {
      const disbursement = await tx.headOfficeDisbursementVoucher.create({
        data: {
          reference,
          reason: input.reason,
          description: input.description ?? null,
          orderer: input.orderer,
          amount: input.amount,
          amountInWords: input.amountInWords,
          proofUrl: input.proofUrl ?? null,
          proofKey: input.proofKey ?? null,
          justificationDescription: input.justificationDescription ?? null,
          ...(input.ordererUserId
            ? { ordererUser: { connect: { id: input.ordererUserId } } }
            : {}),
          ...(input.containerId ? { container: { connect: { id: input.containerId } } } : {}),
          ...(input.parcelId ? { parcel: { connect: { id: input.parcelId } } } : {}),
          ...(input.clientId ? { client: { connect: { id: input.clientId } } } : {}),
          organization: { connect: { id: input.organizationId } },
          cashRegister: { connect: { id: hqRegister.id } },
          issuedBy: { connect: { id: userId } },
        },
      });

      // Debite la caisse siege dans la meme transaction.
      await tx.headOfficeCashRegister.update({
        where: { id: hqRegister.id },
        data: {
          totalExits: { increment: input.amount },
          currentBalance: { decrement: input.amount },
        },
      });

      return disbursement;
    });

    eventBus.emit({
      type: DomainEvents.DISBURSEMENT_CREATED,
      payload: { disbursementId: result.id, organizationId: input.organizationId, amount: input.amount, scope: 'HEAD_OFFICE' },
      timestamp: new Date(),
      userId,
    });

    return result;
  }
}
