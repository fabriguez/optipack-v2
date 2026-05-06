import { inject, injectable } from 'tsyringe';
import { generateReference } from '@transitsoftservices/shared';
import { prisma } from '../../../config/database';
import { CASH_REGISTER_REPOSITORY, type ICashRegisterRepository } from '../../interfaces/ICashRegisterRepository';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';

interface PayEmployeeInput {
  /** Periode au format YYYY-MM. Defaut : mois courant. */
  period?: string;
  /** Montant brut verse (par defaut : baseSalary de l'employe). Les retenues
   *  PENDING sont automatiquement appliquees et deduites de ce montant. */
  amount?: number;
  /** Caisse depuis laquelle on paye. Defaut : caisse du jour de l'agence de l'employe. */
  cashRegisterId?: string;
  description?: string;
  /** Note libre stockee sur le payslip (motif, contexte). */
  note?: string;
  /** IDs des retenues a appliquer (defaut: toutes les retenues PENDING de l'employe). */
  applyDeductionIds?: string[];
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
    const grossAmount = input.amount ?? Number(employee.baseSalary);
    if (grossAmount <= 0) throw new BusinessError('Le montant doit etre superieur a zero.');

    // Resolution des retenues a appliquer
    const deductionsQuery = {
      employeeId,
      status: 'PENDING' as const,
      ...(input.applyDeductionIds?.length && { id: { in: input.applyDeductionIds } }),
    };
    const pendingDeductions = await prisma.salaryDeduction.findMany({ where: deductionsQuery });
    const deductionsTotal = pendingDeductions.reduce((sum, d) => sum + Number(d.amount), 0);
    const netAmount = Math.max(0, grossAmount - deductionsTotal);

    if (netAmount <= 0 && deductionsTotal > 0) {
      throw new BusinessError(
        `Les retenues (${deductionsTotal}) atteignent ou depassent le brut (${grossAmount}). Ajustez les retenues a appliquer.`,
      );
    }

    let cashRegister = input.cashRegisterId
      ? await prisma.agencyCashRegister.findUnique({ where: { id: input.cashRegisterId } })
      : await this.cashRegisterRepo.findOrCreateForToday(employee.agencyId);
    if (!cashRegister) throw new NotFoundError('Caisse', input.cashRegisterId ?? '(default)');

    if (cashRegister.isClosed) {
      cashRegister = await this.cashRegisterRepo.findOrCreateForToday(cashRegister.agencyId);
    }

    if (Number(cashRegister.currentBalance) < netAmount) {
      throw new BusinessError(
        `Solde caisse insuffisant (${Number(cashRegister.currentBalance)} dispo) pour payer ${netAmount}.`,
      );
    }

    return prisma.$transaction(async (tx) => {
      const expense = await tx.expense.create({
        data: {
          agencyId: employee.agencyId,
          title: `Salaire - ${employee.fullName}`,
          reason: `Paiement salaire ${period}`,
          description: [
            input.description ?? '',
            input.note ? `Note: ${input.note}` : '',
            deductionsTotal > 0 ? `Retenues appliquees: ${deductionsTotal} (${pendingDeductions.length} ligne(s))` : '',
          ]
            .filter(Boolean)
            .join('\n') || null,
          category: 'SALARY',
          amount: netAmount,
          approvedByUserId: userId,
          period,
          cashRegisterId: cashRegister!.id,
        },
      });

      // Bon de decaissement (DisbursementVoucher) immuable pour tracabilite
      // financiere (chaque mouvement de caisse a son bon).
      const disbursementCount = await tx.disbursementVoucher.count({
        where: { agencyId: employee.agencyId },
      });
      const disbursement = await tx.disbursementVoucher.create({
        data: {
          reference: generateReference('DEC-SAL', disbursementCount + 1),
          agencyId: employee.agencyId,
          cashRegisterId: cashRegister!.id,
          reason: `Salaire ${period} - ${employee.fullName}`,
          description: input.note ?? input.description ?? null,
          orderer: 'RH',
          amount: netAmount,
          amountInWords: String(netAmount),
          issuedByUserId: userId,
          approvedByUserId: userId,
        },
      });

      // Upsert payslip pour la periode (1 par employe/periode)
      const existing = await tx.payslip.findFirst({ where: { employeeId, period } });
      const payslip = existing
        ? await tx.payslip.update({
            where: { id: existing.id },
            data: {
              isPaid: true,
              paidAt: new Date(),
              paidExpenseId: expense.id,
              paymentNote: input.note ?? null,
              deductionsTotal: deductionsTotal,
              grossSalary: grossAmount,
              netSalary: netAmount,
            },
          })
        : await tx.payslip.create({
            data: {
              employeeId,
              period,
              baseSalary: employee.baseSalary,
              grossSalary: grossAmount,
              netSalary: netAmount,
              isPaid: true,
              paidAt: new Date(),
              paidExpenseId: expense.id,
              paymentNote: input.note ?? null,
              deductionsTotal: deductionsTotal,
            },
          });

      // Marque les retenues comme APPLIED (ponctuelles)
      if (pendingDeductions.length > 0) {
        await tx.salaryDeduction.updateMany({
          where: { id: { in: pendingDeductions.map((d) => d.id) } },
          data: {
            status: 'APPLIED',
            appliedAt: new Date(),
            appliedToExpenseId: expense.id,
            appliedToPayslipId: payslip.id,
          },
        });
      }

      // Debit caisse
      await tx.agencyCashRegister.update({
        where: { id: cashRegister!.id },
        data: {
          totalExits: { increment: netAmount },
          currentBalance: { decrement: netAmount },
        },
      });

      return {
        expense,
        disbursement,
        payslip,
        deductionsApplied: pendingDeductions.length,
        deductionsTotal,
      };
    });
  }

  private currentPeriod(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
}
