import { inject, injectable } from 'tsyringe';
import { prisma } from '../../../config/database';
import { CASH_REGISTER_REPOSITORY, type ICashRegisterRepository } from '../../interfaces/ICashRegisterRepository';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';

interface PayEmployeeInput {
  /** Periode au format YYYY-MM. Defaut : mois courant. */
  period?: string;
  /** Montant verse (par defaut : baseSalary de l'employe). */
  amount?: number;
  /** Caisse depuis laquelle on paye. Defaut : caisse du jour de l'agence de l'employe. */
  cashRegisterId?: string;
  description?: string;
}

/**
 * Effectue le paiement effectif d'un employe :
 *  - debite la caisse choisie
 *  - cree un Expense (ledger immuable) avec lien vers la caisse
 *  - cree (ou marque comme paye) un Payslip pour la periode, lie a l'Expense
 *  - re-synchronise la masse salariale (PayrollChargeService) pour refleter
 *    les eventuels paiements partiels (le defaultAmount reste base sur les
 *    salaires de base ; l'historique des paiements est dans les Expenses).
 */
@injectable()
export class PayEmployeeFromCashRegisterUseCase {
  constructor(
    @inject(CASH_REGISTER_REPOSITORY) private cashRegisterRepo: ICashRegisterRepository,
  ) {}

  async execute(employeeId: string, input: PayEmployeeInput, userId: string) {
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw new NotFoundError('Employe', employeeId);
    if (!employee.isActive) throw new BusinessError('Employe inactif, paiement impossible.');

    const period = input.period ?? this.currentPeriod();
    const amount = input.amount ?? Number(employee.baseSalary);
    if (amount <= 0) throw new BusinessError('Le montant doit etre superieur a zero.');

    let cashRegister = input.cashRegisterId
      ? await prisma.agencyCashRegister.findUnique({ where: { id: input.cashRegisterId } })
      : await this.cashRegisterRepo.findOrCreateForToday(employee.agencyId);
    if (!cashRegister) throw new NotFoundError('Caisse', input.cashRegisterId ?? '(default)');

    if (cashRegister.isClosed) {
      cashRegister = await this.cashRegisterRepo.findOrCreateForToday(cashRegister.agencyId);
    }

    if (Number(cashRegister.currentBalance) < amount) {
      throw new BusinessError(
        `Solde caisse insuffisant (${Number(cashRegister.currentBalance)} dispo) pour payer ${amount}.`,
      );
    }

    return prisma.$transaction(async (tx) => {
      const expense = await tx.expense.create({
        data: {
          agencyId: employee.agencyId,
          title: `Salaire - ${employee.fullName}`,
          reason: `Paiement salaire ${period}`,
          description: input.description ?? null,
          category: 'SALARY',
          amount,
          approvedByUserId: userId,
          period,
          cashRegisterId: cashRegister!.id,
        },
      });

      // Upsert payslip pour la periode (1 par employe/periode)
      const existing = await tx.payslip.findFirst({
        where: { employeeId, period },
      });
      const grossSalary = amount;
      const netSalary = amount;
      const payslip = existing
        ? await tx.payslip.update({
            where: { id: existing.id },
            data: {
              isPaid: true,
              paidAt: new Date(),
              paidExpenseId: expense.id,
            },
          })
        : await tx.payslip.create({
            data: {
              employeeId,
              period,
              baseSalary: employee.baseSalary,
              grossSalary,
              netSalary,
              isPaid: true,
              paidAt: new Date(),
              paidExpenseId: expense.id,
            },
          });

      // Debit caisse
      await tx.agencyCashRegister.update({
        where: { id: cashRegister!.id },
        data: {
          totalExits: { increment: amount },
          currentBalance: { decrement: amount },
        },
      });

      return { expense, payslip };
    });
  }

  private currentPeriod(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
}
