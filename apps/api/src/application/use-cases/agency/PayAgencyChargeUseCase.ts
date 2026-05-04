import { injectable } from 'tsyringe';
import type { PayAgencyChargeInput } from '@transitsoftservices/shared';
import { prisma } from '../../../config/database';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';

const TYPE_LABELS: Record<string, string> = {
  WATER: 'Eau',
  ELECTRICITY: 'Electricite',
  RENT: 'Loyer',
  SALARY: 'Masse salariale',
  INTERNET: 'Internet',
  PHONE: 'Telephone',
  CLEANING: 'Entretien',
  SECURITY: 'Securite',
  MAINTENANCE: 'Maintenance',
  OTHER: 'Autre',
};

/**
 * Enregistre un paiement pour une charge recurrente. Cree un Expense (immuable)
 * lie a la charge avec le tag de periode (YYYY-MM). Plusieurs paiements peuvent
 * exister pour une meme charge/periode (ex : versement partiel puis solde).
 */
@injectable()
export class PayAgencyChargeUseCase {
  async execute(chargeId: string, input: PayAgencyChargeInput, userId: string) {
    const charge = await prisma.agencyCharge.findUnique({
      where: { id: chargeId },
      include: { agency: { select: { id: true, name: true } } },
    });
    if (!charge) throw new NotFoundError('Charge', chargeId);
    if (!charge.isActive) {
      throw new BusinessError('Cette charge est inactive et ne peut pas etre payee.');
    }

    const period = input.period ?? this.currentPeriod();

    const typeLabel = TYPE_LABELS[charge.type] ?? charge.type;
    const expense = await prisma.expense.create({
      data: {
        agencyId: charge.agencyId,
        title: `${typeLabel} - ${charge.label}`,
        reason: `Paiement charge recurrente (${period})`,
        description: input.description ?? null,
        category: charge.type,
        amount: input.amount,
        receiptUrl: input.receiptUrl || null,
        justificationUrl: input.justificationUrl || null,
        approvedByUserId: userId,
        agencyChargeId: charge.id,
        period,
      },
    });

    return expense;
  }

  private currentPeriod(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
}
