import { inject, injectable } from 'tsyringe';
import { generateReference } from '@transitsoftservices/shared';
import { prisma } from '../../../config/database';
import { HEAD_OFFICE_CASH_REGISTER_REPOSITORY, type IHeadOfficeCashRegisterRepository } from '../../interfaces/IHeadOfficeCashRegisterRepository';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';

interface PayEmployeeFromHeadOfficeInput {
  organizationId: string;
  period?: string;
  amount?: number;
  installmentAmount?: number;
  description?: string;
  note?: string;
  applyDeductionIds?: string[];
}

/**
 * Paye un employe depuis la caisse siege. Mirror de
 * PayEmployeeFromCashRegisterUseCase mais le debit s'effectue sur la caisse
 * siege au lieu de la caisse agence. L'Expense reste rattachee a l'agence
 * de l'employe (centre de cout) mais headOfficeCashRegisterId est rempli
 * pour tracer la source des fonds.
 */
@injectable()
export class PayEmployeeFromHeadOfficeUseCase {
  constructor(
    @inject(HEAD_OFFICE_CASH_REGISTER_REPOSITORY) private hqRegisterRepo: IHeadOfficeCashRegisterRepository,
  ) {}

  async execute(employeeId: string, input: PayEmployeeFromHeadOfficeInput, userId: string) {
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw new NotFoundError('Employe', employeeId);
    if (!employee.isActive) throw new BusinessError('Employe inactif, paiement impossible.');

    // Verifie que l'employe appartient bien a l'organisation.
    const agency = await prisma.agency.findUnique({
      where: { id: employee.agencyId },
      select: { organizationId: true },
    });
    if (!agency || agency.organizationId !== input.organizationId) {
      throw new BusinessError("L'employe n'appartient pas a cette organisation.");
    }

    const period = input.period ?? this.currentPeriod();
    const grossAmount = input.amount ?? Number(employee.baseSalary);
    if (grossAmount <= 0) throw new BusinessError('Le montant doit etre superieur a zero.');

    const existingPayslip = await prisma.payslip.findFirst({ where: { employeeId, period } });

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

    const installment = input.installmentAmount ?? remaining;
    if (installment <= 0) throw new BusinessError('Le montant a verser doit etre positif.');
    if (installment > remaining) {
      throw new BusinessError(
        `Versement (${installment}) superieur au reste a payer (${remaining}).`,
      );
    }

    const hqRegister = await this.hqRegisterRepo.findOrCreate(input.organizationId);
    if (Number(hqRegister.currentBalance) < installment) {
      throw new BusinessError(
        `Solde caisse siege insuffisant (${Number(hqRegister.currentBalance)} dispo) pour verser ${installment}.`,
      );
    }

    return prisma.$transaction(async (tx) => {
      const payslip = existingPayslip
        ? existingPayslip
        : await tx.payslip.create({
            data: {
              employeeId,
              period,
              baseSalary: employee.baseSalary,
              grossSalary: grossAmount,
              netSalary,
              isPaid: false,
              paidAmount: 0,
              paymentNote: input.note ?? null,
              deductionsTotal,
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
          title: `${installmentLabel} (siege) - ${employee.fullName}`,
          reason: `${installmentLabel} ${period}`,
          description: [
            input.description ?? '',
            input.note ? `Note: ${input.note}` : '',
            `Payee depuis la caisse siege.`,
            `Versement ${installment} / Net ${netSalary} (deja paye ${alreadyPaid})`,
            isFirstInstallment && deductionsTotal > 0
              ? `Retenues appliquees: ${deductionsTotal} (${pendingDeductions.length} ligne(s))`
              : '',
          ].filter(Boolean).join('\n') || null,
          category: 'SALARY',
          amount: installment,
          approvedByUserId: userId,
          period,
          headOfficeCashRegisterId: hqRegister.id,
        },
      });

      const disbursementCount = await tx.headOfficeDisbursementVoucher.count({
        where: { organizationId: input.organizationId },
      });
      const disbursement = await tx.headOfficeDisbursementVoucher.create({
        data: {
          reference: generateReference('DEC-HQ-SAL', disbursementCount + 1),
          organizationId: input.organizationId,
          headOfficeCashRegisterId: hqRegister.id,
          reason: `${installmentLabel} ${period} - ${employee.fullName}`,
          description: input.note ?? input.description ?? null,
          orderer: 'RH',
          amount: installment,
          amountInWords: String(installment),
          issuedByUserId: userId,
          approvedByUserId: userId,
        },
      });

      await tx.payslipPayment.create({
        data: {
          payslipId: payslip.id,
          expenseId: expense.id,
          amount: installment,
          paidByUserId: userId,
          note: input.note ?? null,
        },
      });

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

      // Debit caisse siege.
      await tx.headOfficeCashRegister.update({
        where: { id: hqRegister.id },
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
