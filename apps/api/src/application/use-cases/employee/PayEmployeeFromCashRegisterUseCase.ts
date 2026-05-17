import { inject, injectable } from 'tsyringe';
import { generateReference } from '@transitsoftservices/shared';
import { prisma } from '../../../config/database';
import { CASH_REGISTER_REPOSITORY, type ICashRegisterRepository } from '../../interfaces/ICashRegisterRepository';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';

interface PayEmployeeInput {
  /** Periode au format YYYY-MM. Defaut : mois courant. */
  period?: string;
  /** Montant brut DE REFERENCE pour cette periode (sert a calculer le net du
   *  payslip lors du PREMIER versement). Defaut : baseSalary. */
  amount?: number;
  /** Montant a verser MAINTENANT (tranche). Defaut : solde restant a payer
   *  (paiement integral). Permet les avances / acomptes / soldes. */
  installmentAmount?: number;
  /** Caisse depuis laquelle on paye. Defaut : caisse du jour de l'agence. */
  cashRegisterId?: string;
  description?: string;
  /** Note libre stockee sur le versement (motif : "avance", "acompte", ...). */
  note?: string;
  /** IDs des retenues a appliquer. Ignore si payslip deja cree (retenues
   *  appliquees au 1er versement uniquement). */
  applyDeductionIds?: string[];
}

/**
 * Paye un employe -- supporte les versements partiels.
 *
 * Comportement :
 *  - Premier appel pour la periode : cree le Payslip (calcule netSalary apres
 *    retenues), cree un PayslipPayment et un Expense pour la tranche, debite
 *    la caisse. Si `installmentAmount` est omis ou egal au net, on solde
 *    directement (isPaid=true).
 *  - Appels suivants : ajoute un PayslipPayment, additionne paidAmount,
 *    debite la caisse, marque isPaid=true des que paidAmount >= netSalary.
 *
 * Cas d'usage :
 *  - Caisse insuffisante : paye une fraction maintenant, le reste plus tard.
 *  - Avance avant date de salaire : `installmentAmount` < net, paidAt n'est
 *    pas la fin de mois.
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

    const existingPayslip = await prisma.payslip.findFirst({ where: { employeeId, period } });

    // Calcul des retenues : appliquees uniquement au PREMIER versement
    // (creation du payslip). Pour les versements suivants, les retenues sont
    // deja fixees dans payslip.deductionsTotal.
    let deductionsTotal = 0;
    let pendingDeductions: { id: string; amount: any }[] = [];
    let netSalary: number;

    if (!existingPayslip) {
      const deductionsQuery = {
        employeeId,
        status: 'PENDING' as const,
        ...(input.applyDeductionIds?.length && { id: { in: input.applyDeductionIds } }),
      };
      pendingDeductions = await prisma.salaryDeduction.findMany({ where: deductionsQuery });
      deductionsTotal = pendingDeductions.reduce((sum, d) => sum + Number(d.amount), 0);
      netSalary = Math.max(0, grossAmount - deductionsTotal);

      if (netSalary <= 0 && deductionsTotal > 0) {
        throw new BusinessError(
          `Les retenues (${deductionsTotal}) atteignent ou depassent le brut (${grossAmount}). Ajustez les retenues.`,
        );
      }
    } else {
      netSalary = Number(existingPayslip.netSalary);
      if (existingPayslip.isPaid) {
        throw new BusinessError(`Le salaire ${period} est deja entierement paye.`);
      }
    }

    const alreadyPaid = existingPayslip ? Number(existingPayslip.paidAmount) : 0;
    const remaining = Math.max(0, netSalary - alreadyPaid);
    if (remaining <= 0) {
      throw new BusinessError(`Aucun montant restant a payer pour ${period}.`);
    }

    // Tranche a verser : par defaut le solde restant (paiement integral).
    let installment = input.installmentAmount ?? remaining;
    if (installment <= 0) throw new BusinessError('Le montant a verser doit etre positif.');
    if (installment > remaining) {
      throw new BusinessError(
        `Versement (${installment}) superieur au reste a payer (${remaining}).`,
      );
    }

    let cashRegister = input.cashRegisterId
      ? await prisma.agencyCashRegister.findUnique({ where: { id: input.cashRegisterId } })
      : await this.cashRegisterRepo.findOrCreateForToday(employee.agencyId);
    if (!cashRegister) throw new NotFoundError('Caisse', input.cashRegisterId ?? '(default)');

    if (cashRegister.isClosed) {
      cashRegister = await this.cashRegisterRepo.findOrCreateForToday(cashRegister.agencyId);
    }

    if (Number(cashRegister.currentBalance) < installment) {
      throw new BusinessError(
        `Solde caisse insuffisant (${Number(cashRegister.currentBalance)} dispo) pour verser ${installment}.`,
      );
    }

    return prisma.$transaction(async (tx) => {
      // Cree ou recupere le payslip de la periode.
      const payslip = existingPayslip
        ? existingPayslip
        : await tx.payslip.create({
            data: {
              employeeId,
              period,
              baseSalary: employee.baseSalary,
              grossSalary: grossAmount,
              netSalary: netSalary,
              isPaid: false,
              paidAmount: 0,
              paymentNote: input.note ?? null,
              deductionsTotal: deductionsTotal,
            },
          });

      const isFirstInstallment = !existingPayslip;
      const newPaidAmount = alreadyPaid + installment;
      const willBeFullyPaid = newPaidAmount >= netSalary;
      const installmentLabel = willBeFullyPaid
        ? (isFirstInstallment ? 'Salaire' : 'Solde salaire')
        : (isFirstInstallment ? 'Avance salaire' : 'Acompte salaire');

      const expense = await tx.expense.create({
        data: {
          agencyId: employee.agencyId,
          title: `${installmentLabel} - ${employee.fullName}`,
          reason: `${installmentLabel} ${period}`,
          description: [
            input.description ?? '',
            input.note ? `Note: ${input.note}` : '',
            `Versement ${installment} / Net ${netSalary} (deja paye ${alreadyPaid})`,
            isFirstInstallment && deductionsTotal > 0
              ? `Retenues appliquees: ${deductionsTotal} (${pendingDeductions.length} ligne(s))`
              : '',
          ]
            .filter(Boolean)
            .join('\n') || null,
          category: 'SALARY',
          amount: installment,
          approvedByUserId: userId,
          period,
          cashRegisterId: cashRegister!.id,
        },
      });

      // Bon de decaissement (DisbursementVoucher) par tranche.
      const disbursementCount = await tx.disbursementVoucher.count({
        where: { agencyId: employee.agencyId },
      });
      const disbursement = await tx.disbursementVoucher.create({
        data: {
          reference: generateReference('DEC-SAL', disbursementCount + 1),
          agencyId: employee.agencyId,
          cashRegisterId: cashRegister!.id,
          reason: `${installmentLabel} ${period} - ${employee.fullName}`,
          description: input.note ?? input.description ?? null,
          orderer: 'RH',
          amount: installment,
          amountInWords: String(installment),
          issuedByUserId: userId,
          approvedByUserId: userId,
        },
      });

      // Enregistre la tranche.
      await tx.payslipPayment.create({
        data: {
          payslipId: payslip.id,
          expenseId: expense.id,
          amount: installment,
          paidByUserId: userId,
          note: input.note ?? null,
        },
      });

      // Met a jour le payslip : paidAmount cumulatif, isPaid si solde atteint,
      // paidExpenseId pointe sur le dernier versement (back-compat).
      const updatedPayslip = await tx.payslip.update({
        where: { id: payslip.id },
        data: {
          paidAmount: newPaidAmount,
          isPaid: willBeFullyPaid,
          paidAt: new Date(),
          paidExpenseId: expense.id,
          paymentNote: input.note ?? payslip.paymentNote,
        },
      });

      // Retenues appliquees au 1er versement uniquement.
      if (isFirstInstallment && pendingDeductions.length > 0) {
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

      // Debit caisse.
      await tx.agencyCashRegister.update({
        where: { id: cashRegister!.id },
        data: {
          totalExits: { increment: installment },
          currentBalance: { decrement: installment },
        },
      });

      return {
        expense,
        disbursement,
        payslip: updatedPayslip,
        installmentAmount: installment,
        remainingAmount: Math.max(0, netSalary - newPaidAmount),
        isFullyPaid: willBeFullyPaid,
        deductionsApplied: isFirstInstallment ? pendingDeductions.length : 0,
        deductionsTotal: isFirstInstallment ? deductionsTotal : Number(payslip.deductionsTotal ?? 0),
      };
    });
  }

  private currentPeriod(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
}
