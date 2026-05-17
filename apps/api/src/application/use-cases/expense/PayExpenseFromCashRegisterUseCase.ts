import { inject, injectable } from 'tsyringe';
import { generateReference } from '@transitsoftservices/shared';
import { prisma } from '../../../config/database';
import { CASH_REGISTER_REPOSITORY, type ICashRegisterRepository } from '../../interfaces/ICashRegisterRepository';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';

interface Input {
  expenseId: string;
  /** Caisse depuis laquelle on paye. Defaut : caisse du jour de l'agence de la depense. */
  cashRegisterId?: string;
  note?: string;
}

/**
 * Solde une depense non payee depuis une caisse. Debite la caisse, marque
 * la depense isPaid=true, lie cashRegisterId, et emet un DisbursementVoucher
 * trace dans le rapport journalier.
 *
 * Refus si depense deja payee, montant > solde caisse, caisse fermee
 * (bascule sur caisse du jour suivant), ou expense lie a un conteneur sans
 * permissions.
 */
@injectable()
export class PayExpenseFromCashRegisterUseCase {
  constructor(
    @inject(CASH_REGISTER_REPOSITORY) private cashRegisterRepo: ICashRegisterRepository,
  ) {}

  async execute(input: Input, userId: string) {
    const expense = await prisma.expense.findUnique({
      where: { id: input.expenseId },
      include: { container: { select: { id: true, designation: true } } },
    });
    if (!expense) throw new NotFoundError('Depense', input.expenseId);
    if (expense.isPaid) throw new BusinessError('Cette depense est deja payee.');

    let cashRegister = input.cashRegisterId
      ? await prisma.agencyCashRegister.findUnique({ where: { id: input.cashRegisterId } })
      : await this.cashRegisterRepo.findOrCreateForToday(expense.agencyId);
    if (!cashRegister) throw new NotFoundError('Caisse', input.cashRegisterId ?? '(default)');

    if (cashRegister.isClosed) {
      cashRegister = await this.cashRegisterRepo.findOrCreateForToday(cashRegister.agencyId);
    }

    const amount = Number(expense.amount);
    if (Number(cashRegister.currentBalance) < amount) {
      throw new BusinessError(
        `Solde caisse insuffisant (${Number(cashRegister.currentBalance)} dispo) pour payer ${amount}.`,
      );
    }

    return prisma.$transaction(async (tx) => {
      // Bon de decaissement (DisbursementVoucher) trace.
      const disbursementCount = await tx.disbursementVoucher.count({
        where: { agencyId: expense.agencyId },
      });
      const reasonLabel = expense.container
        ? `Depense conteneur ${expense.container.designation} - ${expense.title}`
        : expense.title;
      const disbursement = await tx.disbursementVoucher.create({
        data: {
          reference: generateReference('DEC-EXP', disbursementCount + 1),
          agencyId: expense.agencyId,
          cashRegisterId: cashRegister!.id,
          reason: reasonLabel,
          description: input.note ?? expense.description ?? null,
          orderer: expense.container ? 'CONTENEUR' : 'AGENCE',
          amount,
          amountInWords: String(amount),
          issuedByUserId: userId,
          approvedByUserId: userId,
          ...(expense.containerId && { containerId: expense.containerId }),
        },
      });

      const updated = await tx.expense.update({
        where: { id: expense.id },
        data: {
          isPaid: true,
          paidAt: new Date(),
          paidByUserId: userId,
          cashRegisterId: cashRegister!.id,
        },
      });

      await tx.agencyCashRegister.update({
        where: { id: cashRegister!.id },
        data: {
          totalExits: { increment: amount },
          currentBalance: { decrement: amount },
        },
      });

      return { expense: updated, disbursement, cashRegisterId: cashRegister!.id };
    });
  }
}
