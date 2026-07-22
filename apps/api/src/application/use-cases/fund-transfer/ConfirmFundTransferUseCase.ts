import { inject, injectable } from 'tsyringe';
import { FUND_TRANSFER_REPOSITORY, type IFundTransferRepository } from '../../interfaces/IFundTransferRepository';
import { HEAD_OFFICE_CASH_REGISTER_REPOSITORY, type IHeadOfficeCashRegisterRepository } from '../../interfaces/IHeadOfficeCashRegisterRepository';
import { CASH_REGISTER_REPOSITORY, type ICashRegisterRepository } from '../../interfaces/ICashRegisterRepository';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';
import { eventBus, DomainEvents } from '../../../infrastructure/events/EventBus';
import { createChildLogger } from '../../../config/logger';
import { prisma } from '../../../config/database';
import { assertAgencyActive } from '../../services/scope/agencyScope';

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
    @inject(HEAD_OFFICE_CASH_REGISTER_REPOSITORY) private hqRegisterRepo: IHeadOfficeCashRegisterRepository,
    @inject(CASH_REGISTER_REPOSITORY) private cashRegisterRepo: ICashRegisterRepository,
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

    // Agence de destination desactivee : on ne peut pas y confirmer l'arrivee
    // des fonds (creation/credit de caisse).
    if (transfer.destinationType === 'AGENCY' && transfer.destinationAgencyId) {
      await assertAgencyActive(transfer.destinationAgencyId);
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

    const amount = Number(transfer.amount);

    const confirmed = await this.transferRepo.update(id, {
      status: 'CONFIRMED',
      confirmedBy: { connect: { id: userId } },
    });

    // Effets caisse cote destination, deduits lors de la confirmation pour
    // garantir que tant qu'un transfert est PENDING, ni le siege ni l'agence
    // destinataire ne voient l'argent.
    if (transfer.destinationType === 'HQ') {
      // Source agence -> siege : credit le siege de l'organisation de l'agence.
      // (Source HQ -> HQ est interdit a la creation.)
      if (transfer.sourceAgencyId) {
        const sourceAgency = await prisma.agency.findUnique({
          where: { id: transfer.sourceAgencyId },
          select: { organizationId: true },
        });
        if (!sourceAgency) {
          throw new NotFoundError('Agence source', transfer.sourceAgencyId);
        }
        const hqRegister = await this.hqRegisterRepo.findOrCreate(sourceAgency.organizationId);
        await this.hqRegisterRepo.addEntry(hqRegister.id, amount);
      }
    } else if (transfer.destinationType === 'AGENCY' && transfer.destinationAgencyId) {
      // Credit la caisse du jour de l'agence destinataire (typique pour les
      // transferts inter-agences et les redotations depuis le siege).
      const destRegister = await this.cashRegisterRepo.findOrCreateForToday(transfer.destinationAgencyId);
      await this.cashRegisterRepo.addEntry(destRegister.id, amount);
    }
    // destinationType === 'BANK' : pas de registre interne a crediter.

    eventBus.emit({
      type: DomainEvents.FUND_TRANSFER_CONFIRMED,
      payload: { transferId: id, amount },
      timestamp: new Date(),
      userId,
    });

    return confirmed;
  }
}
