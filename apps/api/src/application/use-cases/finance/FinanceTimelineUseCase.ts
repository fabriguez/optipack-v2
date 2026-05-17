import { injectable } from 'tsyringe';
import { prisma } from '../../../config/database';

export type FinanceEventType =
  | 'SALARY_PAYMENT'
  | 'CHARGE_PAYMENT'
  | 'FUND_TRANSFER'
  | 'DEBT_CREATED'
  | 'DEBT_PAYMENT';

export interface FinanceEvent {
  id: string;
  type: FinanceEventType;
  date: Date;
  amount: number;
  agencyId: string | null;
  agencyName?: string | null;
  label: string;
  description?: string | null;
  reference?: string | null;
  userId?: string | null;
  userName?: string | null;
  meta?: Record<string, any>;
}

interface Input {
  agencyIds: string[];
  agencyId?: string;
  types?: FinanceEventType[];
  from?: string;
  to?: string;
  limit?: number;
}

/**
 * Timeline financiere unifiee : agrege en un seul flux trie par date
 * decroissante les versements de salaires (avances/acomptes/soldes), les
 * paiements de charges recurrentes, les transferts de fonds, et les
 * mouvements de dettes (avances accordees + remboursements).
 *
 * Optimisation : on requete chaque source en parallele, on borne par `limit`
 * cote source, on fusionne+trie+coupe a la fin. Idempotent (lecture seule).
 */
@injectable()
export class FinanceTimelineUseCase {
  async execute(input: Input): Promise<{ events: FinanceEvent[]; total: number }> {
    const limit = Math.min(Math.max(input.limit ?? 100, 1), 500);
    const scopedAgencies = input.agencyId
      ? input.agencyIds.includes(input.agencyId) ? [input.agencyId] : []
      : input.agencyIds;
    if (scopedAgencies.length === 0) return { events: [], total: 0 };

    const types = new Set<FinanceEventType>(
      input.types && input.types.length > 0
        ? input.types
        : ['SALARY_PAYMENT', 'CHARGE_PAYMENT', 'FUND_TRANSFER', 'DEBT_CREATED', 'DEBT_PAYMENT'],
    );

    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (input.from) dateFilter.gte = new Date(input.from);
    if (input.to) dateFilter.lte = new Date(input.to);
    const hasDate = !!(dateFilter.gte || dateFilter.lte);

    const tasks: Promise<FinanceEvent[]>[] = [];

    if (types.has('SALARY_PAYMENT')) {
      tasks.push(
        prisma.payslipPayment
          .findMany({
            where: {
              payslip: { employee: { agencyId: { in: scopedAgencies } } },
              ...(hasDate && { paidAt: dateFilter }),
            },
            orderBy: { paidAt: 'desc' },
            take: limit,
            include: {
              payslip: {
                include: {
                  employee: { select: { id: true, fullName: true, agencyId: true, agency: { select: { name: true } } } },
                },
              },
              paidBy: { select: { id: true, firstName: true, lastName: true } },
              expense: { select: { id: true, cashRegisterId: true } },
            },
          })
          .then((rows) =>
            rows.map<FinanceEvent>((p) => ({
              id: `salary-${p.id}`,
              type: 'SALARY_PAYMENT',
              date: p.paidAt,
              amount: Number(p.amount),
              agencyId: p.payslip.employee.agencyId,
              agencyName: p.payslip.employee.agency?.name ?? null,
              label: `Versement salaire - ${p.payslip.employee.fullName}`,
              description: p.note ?? null,
              reference: p.payslip.period,
              userId: p.paidByUserId,
              userName: p.paidBy ? `${p.paidBy.firstName} ${p.paidBy.lastName}` : null,
              meta: {
                payslipId: p.payslipId,
                employeeId: p.payslip.employee.id,
                expenseId: p.expenseId,
                cashRegisterId: p.expense?.cashRegisterId ?? null,
                period: p.payslip.period,
                netSalary: Number(p.payslip.netSalary),
                paidAmount: Number(p.payslip.paidAmount),
                isFullyPaid: p.payslip.isPaid,
              },
            })),
          ),
      );
    }

    if (types.has('CHARGE_PAYMENT')) {
      tasks.push(
        prisma.expense
          .findMany({
            where: {
              agencyId: { in: scopedAgencies },
              agencyChargeId: { not: null },
              ...(hasDate && { createdAt: dateFilter }),
            },
            orderBy: { createdAt: 'desc' },
            take: limit,
            include: {
              agency: { select: { name: true } },
              agencyCharge: { select: { id: true, label: true, type: true, isAutoManaged: true } },
              approvedBy: { select: { id: true, firstName: true, lastName: true } },
            },
          })
          .then((rows) =>
            rows
              // Les expenses lies a la charge SALARY auto sont en realite des
              // versements salaires (deja remontes via SALARY_PAYMENT). On
              // evite le doublon en filtrant ici.
              .filter((e) => !(e.agencyCharge?.isAutoManaged && e.agencyCharge?.type === 'SALARY'))
              .map<FinanceEvent>((e) => ({
                id: `charge-${e.id}`,
                type: 'CHARGE_PAYMENT',
                date: e.createdAt,
                amount: Number(e.amount),
                agencyId: e.agencyId,
                agencyName: e.agency?.name ?? null,
                label: `Paiement charge - ${e.agencyCharge?.label ?? e.title}`,
                description: e.description ?? e.reason,
                reference: e.period ?? null,
                userId: e.approvedByUserId,
                userName: e.approvedBy ? `${e.approvedBy.firstName} ${e.approvedBy.lastName}` : null,
                meta: {
                  chargeId: e.agencyChargeId,
                  chargeType: e.agencyCharge?.type,
                  expenseId: e.id,
                  cashRegisterId: e.cashRegisterId,
                  period: e.period,
                },
              })),
          ),
      );
    }

    if (types.has('FUND_TRANSFER')) {
      tasks.push(
        prisma.fundTransfer
          .findMany({
            where: {
              OR: [
                { sourceAgencyId: { in: scopedAgencies } },
                { destinationAgencyId: { in: scopedAgencies } },
              ],
              ...(hasDate && { createdAt: dateFilter }),
            },
            orderBy: { createdAt: 'desc' },
            take: limit,
            include: {
              sourceAgency: { select: { name: true } },
              destinationAgency: { select: { name: true } },
              initiatedBy: { select: { id: true, firstName: true, lastName: true } },
            },
          })
          .then((rows) =>
            rows.map<FinanceEvent>((t) => {
              const destLabel =
                t.destinationType === 'AGENCY'
                  ? t.destinationAgency?.name ?? '-'
                  : t.destinationType === 'BANK'
                    ? `Banque (${t.destinationLabel ?? ''})`.trim()
                    : `Siege (${t.destinationLabel ?? ''})`.trim();
              return {
                id: `transfer-${t.id}`,
                type: 'FUND_TRANSFER',
                date: t.createdAt,
                amount: Number(t.amount),
                agencyId: t.sourceAgencyId,
                agencyName: t.sourceAgency?.name ?? null,
                label: `Transfert vers ${destLabel}`,
                description: t.transferMethod,
                reference: t.reference,
                userId: t.initiatedByUserId,
                userName: t.initiatedBy ? `${t.initiatedBy.firstName} ${t.initiatedBy.lastName}` : null,
                meta: {
                  status: t.status,
                  isVoided: t.isVoided,
                  destinationType: t.destinationType,
                  destinationAgencyId: t.destinationAgencyId,
                },
              };
            }),
          ),
      );
    }

    if (types.has('DEBT_CREATED')) {
      tasks.push(
        prisma.debt
          .findMany({
            where: {
              agencyId: { in: scopedAgencies },
              ...(hasDate && { createdAt: dateFilter }),
            },
            orderBy: { createdAt: 'desc' },
            take: limit,
            include: {
              agency: { select: { name: true } },
              employee: { select: { fullName: true } },
              client: { select: { fullName: true } },
              createdBy: { select: { id: true, firstName: true, lastName: true } },
            },
          })
          .then((rows) =>
            rows.map<FinanceEvent>((d) => {
              const target =
                d.type === 'EMPLOYEE'
                  ? d.employee?.fullName ?? '-'
                  : d.type === 'CLIENT'
                    ? d.client?.fullName ?? '-'
                    : d.creditor ?? '-';
              return {
                id: `debt-${d.id}`,
                type: 'DEBT_CREATED',
                date: d.createdAt,
                amount: Number(d.totalAmount),
                agencyId: d.agencyId,
                agencyName: d.agency?.name ?? null,
                label: `${d.type === 'EMPLOYEE' ? 'Avance accordee' : 'Dette ' + d.type.toLowerCase()} - ${target}`,
                description: d.motif,
                reference: d.reference,
                userId: d.createdByUserId,
                userName: d.createdBy ? `${d.createdBy.firstName} ${d.createdBy.lastName}` : null,
                meta: {
                  debtId: d.id,
                  debtType: d.type,
                  remainingAmount: Number(d.remainingAmount),
                  status: d.status,
                },
              };
            }),
          ),
      );
    }

    if (types.has('DEBT_PAYMENT')) {
      tasks.push(
        prisma.debtPayment
          .findMany({
            where: {
              agencyId: { in: scopedAgencies },
              ...(hasDate && { createdAt: dateFilter }),
            },
            orderBy: { createdAt: 'desc' },
            take: limit,
            include: {
              agency: { select: { name: true } },
              debt: {
                select: {
                  id: true,
                  type: true,
                  reference: true,
                  employee: { select: { fullName: true } },
                  client: { select: { fullName: true } },
                },
              },
              receivedBy: { select: { id: true, firstName: true, lastName: true } },
            },
          })
          .then((rows) =>
            rows.map<FinanceEvent>((p) => {
              const target =
                p.debt.type === 'EMPLOYEE'
                  ? p.debt.employee?.fullName ?? '-'
                  : p.debt.type === 'CLIENT'
                    ? p.debt.client?.fullName ?? '-'
                    : '-';
              return {
                id: `debt-payment-${p.id}`,
                type: 'DEBT_PAYMENT',
                date: p.createdAt,
                amount: Number(p.amount),
                agencyId: p.agencyId,
                agencyName: p.agency?.name ?? null,
                label: `${p.debt.type === 'EMPLOYEE' ? 'Remboursement avance' : 'Paiement dette'} - ${target}`,
                description: p.comment ?? null,
                reference: p.reference,
                userId: p.receivedByUserId,
                userName: p.receivedBy ? `${p.receivedBy.firstName} ${p.receivedBy.lastName}` : null,
                meta: {
                  debtId: p.debtId,
                  debtType: p.debt.type,
                  paymentMethod: p.paymentMethod,
                  cashRegisterId: p.cashRegisterId,
                  isVoided: p.isVoided,
                },
              };
            }),
          ),
      );
    }

    const buckets = await Promise.all(tasks);
    const merged = buckets.flat().sort((a, b) => b.date.getTime() - a.date.getTime());
    return { events: merged.slice(0, limit), total: merged.length };
  }
}
