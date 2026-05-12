import { inject, injectable } from 'tsyringe';
import { FUND_TRANSFER_REPOSITORY, type IFundTransferRepository } from '../../interfaces/IFundTransferRepository';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';
import { eventBus, DomainEvents } from '../../../infrastructure/events/EventBus';
import { createChildLogger } from '../../../config/logger';

const logger = createChildLogger('ConfirmFundTransfer');

interface ConfirmOptions {
  /** Force la confirmation meme si initiateur = confirmateur. Reserve SUPER_ADMIN. */
  bypassFourEyes?: boolean;
  /** Role de l'utilisateur, pour autoriser bypass si SUPER_ADMIN. */
  userRole?: string;
}

@injectable()
export class ConfirmFundTransferUseCase {
  constructor(
    @inject(FUND_TRANSFER_REPOSITORY) private transferRepo: IFundTransferRepository,
  ) {}

  async execute(id: string, userId: string, options: ConfirmOptions = {}) {
    const transfer = await this.transferRepo.findById(id);
    if (!transfer) throw new NotFoundError('Transfert de fonds', id);

    // Refus explicites avec contexte clair pour l'utilisateur.
    if (transfer.isVoided) {
      throw new BusinessError('Transfert annule : confirmation impossible.');
    }
    if (transfer.status === 'CONFIRMED') {
      throw new BusinessError('Transfert deja confirme.');
    }
    if (transfer.status === 'VOIDED') {
      throw new BusinessError('Transfert annule (VOIDED) : confirmation impossible.');
    }
    if (transfer.status !== 'PENDING') {
      throw new BusinessError(
        `Transfert ne peut etre confirme : statut courant = ${transfer.status} (attendu PENDING).`,
      );
    }

    // Principe des 4 yeux : confirmateur != initiateur, sauf override SUPER_ADMIN.
    const isSameUser = transfer.initiatedByUserId === userId;
    const canBypass = options.bypassFourEyes === true && options.userRole === 'SUPER_ADMIN';
    if (isSameUser && !canBypass) {
      logger.warn(
        { transferId: id, userId, initiatedByUserId: transfer.initiatedByUserId },
        'Tentative de confirmation par l\'initiateur (refusee)',
      );
      throw new BusinessError(
        'Vous ne pouvez pas confirmer un transfert que vous avez initie (principe des 4 yeux). ' +
          'Un autre admin doit confirmer (ou un SUPER_ADMIN avec bypassFourEyes=true).',
      );
    }

    logger.info(
      { transferId: id, userId, isSameUser, bypassed: canBypass },
      'Confirmation transfert de fonds',
    );

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
