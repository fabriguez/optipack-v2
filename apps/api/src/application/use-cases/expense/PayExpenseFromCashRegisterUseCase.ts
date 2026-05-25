import { inject, injectable } from 'tsyringe';
import { generateReference } from '@transitsoftservices/shared';
import { prisma } from '../../../config/database';
import { CASH_REGISTER_REPOSITORY, type ICashRegisterRepository } from '../../interfaces/ICashRegisterRepository';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';

interface Input {
  expenseId: string;
  /** Caisse depuis laquelle on paye. Defaut : caisse du jour de l'agence
   *  resolue (agencyId si fourni, sinon expense.agencyId). */
  cashRegisterId?: string;
  /** Agence payeuse (override l'agence de la depense). Utile pour les
   *  depenses de conteneur payees depuis une autre agence (ex : agence
   *  d'arrivee paye une depense saisie a l'agence de depart). */
  agencyId?: string;
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
    // Une depense auto (propagee depuis un forwarding) ne peut PAS etre
    // payee directement : elle est soldee automatiquement quand on paye la
    // depense forwarding parente (cascade). Sinon risque de double paiement.
    if (expense.isAutoFromForwarding) {
      throw new BusinessError(
        'Cette depense provient d\'une propagation forwarding. Payez la depense parente sur le conteneur d\'acheminement -- le statut sera propage automatiquement ici.',
      );
    }

    // Resolution agence payeuse :
    //  1. cashRegisterId explicite (priorite max)
    //  2. agencyId fourni (override pour depenses conteneur)
    //  3. expense.agencyId par defaut
    const payerAgencyId = input.agencyId ?? expense.agencyId;
    if (input.agencyId && input.agencyId !== expense.agencyId) {
      // Verifie que l'agence existe + meme organisation que la depense.
      const payerAgency = await prisma.agency.findUnique({
        where: { id: input.agencyId },
        select: { id: true, organizationId: true },
      });
      if (!payerAgency) throw new NotFoundError('Agence payeuse', input.agencyId);
      const expenseAgency = await prisma.agency.findUnique({
        where: { id: expense.agencyId },
        select: { organizationId: true },
      });
      if (payerAgency.organizationId !== expenseAgency?.organizationId) {
        throw new BusinessError("L'agence payeuse doit appartenir a la meme organisation que la depense.");
      }
    }

    let cashRegister = input.cashRegisterId
      ? await prisma.agencyCashRegister.findUnique({ where: { id: input.cashRegisterId } })
      : await this.cashRegisterRepo.findOrCreateForToday(payerAgencyId);
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
          reference: generateReference('DEC-EXP', Date.now()),
          // Le bon de decaissement est emis par l'agence payeuse (= proprietaire
          // de la caisse debitee), pas necessairement l'agence de la depense.
          agencyId: cashRegister!.agencyId,
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
          // Lien 1-1 vers le bon : permet la dedup dans le profit du
          // rapport journalier (cf DailyReportService.disbursementsTotalDedup).
          disbursementId: disbursement.id,
        },
      });

      await tx.agencyCashRegister.update({
        where: { id: cashRegister!.id },
        data: {
          totalExits: { increment: amount },
          currentBalance: { decrement: amount },
        },
      });

      // Cascade isPaid=true sur les depenses auto-propagees aux parents.
      // Pas de debit caisse supplementaire : la depense parente couvre tout.
      // Pas de disbursementId (1 disbursement par caisse, unique sur expense).
      const cascade = await tx.expense.updateMany({
        where: {
          parentExpenseId: expense.id,
          isAutoFromForwarding: true,
          isPaid: false,
        },
        data: {
          isPaid: true,
          paidAt: new Date(),
          paidByUserId: userId,
        },
      });

      return {
        expense: updated,
        disbursement,
        cashRegisterId: cashRegister!.id,
        cascadedChildren: cascade.count,
      };
    });
  }
}
