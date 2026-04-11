import { inject, injectable } from 'tsyringe';
import { FUND_TRANSFER_REPOSITORY, type IFundTransferRepository } from '../../interfaces/IFundTransferRepository';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';
import { eventBus, DomainEvents } from '../../../infrastructure/events/EventBus';

@injectable()
export class ConfirmFundTransferUseCase {
  constructor(
    @inject(FUND_TRANSFER_REPOSITORY) private transferRepo: IFundTransferRepository,
  ) {}

  async execute(id: string, userId: string) {
    const transfer = await this.transferRepo.findById(id);
    if (!transfer) throw new NotFoundError('Transfert de fonds', id);

    if (transfer.status !== 'PENDING') {
      throw new BusinessError(`Transfert ne peut pas etre confirme au statut ${transfer.status}`);
    }

    const confirmed = await this.transferRepo.update(id, {
      status: 'CONFIRMED',
      confirmedBy: { connect: { id: userId } },
    });

    eventBus.emit({
      type: DomainEvents.FUND_TRANSFER_CONFIRMED,
      payload: { transferId: id, amount: Number(transfer.amount) },
      timestamp: new Date(),
      userId,
    });

    return confirmed;
  }
}
