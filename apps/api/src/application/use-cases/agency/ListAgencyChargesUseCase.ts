import { injectable } from 'tsyringe';
import { prisma } from '../../../config/database';
import { NotFoundError } from '../../../domain/errors/BusinessError';

/**
 * Liste les charges recurrentes d'une agence + statut paiement pour une periode donnee.
 * - period (YYYY-MM) : si omis, utilise le mois courant.
 * - Pour chaque charge, on agrege les expenses lies au charge & periode pour calculer
 *   le total deja paye et le statut (paid/unpaid/partial).
 */
@injectable()
export class ListAgencyChargesUseCase {
  async execute(agencyId: string, period?: string) {
    const agency = await prisma.agency.findUnique({ where: { id: agencyId } });
    if (!agency) throw new NotFoundError('Agence', agencyId);

    const targetPeriod = period ?? this.currentPeriod();

    const charges = await prisma.agencyCharge.findMany({
      where: { agencyId, isActive: true },
      orderBy: [{ type: 'asc' }, { label: 'asc' }],
    });

    const expenses = await prisma.expense.findMany({
      where: {
        agencyChargeId: { in: charges.map((c) => c.id) },
        period: targetPeriod,
      },
      select: {
        id: true,
        agencyChargeId: true,
        amount: true,
        createdAt: true,
        title: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const paidByCharge = new Map<string, number>();
    const expensesByCharge = new Map<string, typeof expenses>();
    for (const e of expenses) {
      if (!e.agencyChargeId) continue;
      paidByCharge.set(
        e.agencyChargeId,
        (paidByCharge.get(e.agencyChargeId) ?? 0) + Number(e.amount),
      );
      const list = expensesByCharge.get(e.agencyChargeId) ?? [];
      list.push(e);
      expensesByCharge.set(e.agencyChargeId, list);
    }

    const items = charges.map((c) => {
      const paid = paidByCharge.get(c.id) ?? 0;
      const expected = Number(c.defaultAmount);
      let status: 'PAID' | 'PARTIAL' | 'UNPAID';
      if (paid <= 0) status = 'UNPAID';
      else if (paid >= expected - 0.001) status = 'PAID';
      else status = 'PARTIAL';

      return {
        ...c,
        defaultAmount: Number(c.defaultAmount),
        period: targetPeriod,
        paidAmount: Number(paid.toFixed(2)),
        balance: Number(Math.max(0, expected - paid).toFixed(2)),
        status,
        payments: expensesByCharge.get(c.id) ?? [],
      };
    });

    const totals = items.reduce(
      (acc, c) => {
        acc.expected += Number(c.defaultAmount);
        acc.paid += c.paidAmount;
        return acc;
      },
      { expected: 0, paid: 0 },
    );

    return {
      period: targetPeriod,
      totals: {
        expected: Number(totals.expected.toFixed(2)),
        paid: Number(totals.paid.toFixed(2)),
        balance: Number(Math.max(0, totals.expected - totals.paid).toFixed(2)),
      },
      items,
    };
  }

  private currentPeriod(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
}
