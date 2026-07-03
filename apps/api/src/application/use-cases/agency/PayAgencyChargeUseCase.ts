import { inject, injectable } from 'tsyringe';
import type { PayAgencyChargeInput } from '@transitsoftservices/shared';
import { prisma } from '../../../config/database';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';
import { CASH_REGISTER_REPOSITORY, type ICashRegisterRepository } from '../../interfaces/ICashRegisterRepository';

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

interface PayInput extends PayAgencyChargeInput {
  // Caisse depuis laquelle on paye. Si absent, on utilise la caisse du jour de
  // l'agence proprietaire de la charge (compat ascendante).
  cashRegisterId?: string;
}

/**
 * Enregistre un paiement pour une charge recurrente :
 *  - Cree un Expense (ledger immuable) avec lien vers la charge + periode (YYYY-MM)
 *  - Debite la caisse choisie (defaut : caisse du jour de l'agence)
 *  - Trace l'evenement dans l'historique de la charge
 *
 * Plusieurs paiements peuvent exister pour une meme charge/periode (versement partiel).
 */
@injectable()
export class PayAgencyChargeUseCase {
  constructor(
    @inject(CASH_REGISTER_REPOSITORY) private cashRegisterRepo: ICashRegisterRepository,
  ) {}

  async execute(chargeId: string, input: PayInput, userId: string, organizationId: string) {
    const charge = await prisma.agencyCharge.findUnique({
      where: { id: chargeId },
      include: { agency: { select: { id: true, name: true, organizationId: true } } },
    });
    if (!charge || charge.agency.organizationId !== organizationId) {
      throw new NotFoundError('Charge', chargeId);
    }
    if (!charge.isActive) {
      throw new BusinessError('Cette charge est inactive et ne peut pas etre payee.');
    }
    if (input.amount <= 0) {
      throw new BusinessError('Le montant doit etre superieur a zero.');
    }

    const period = input.period ?? this.currentPeriod();

    // Resolution de la caisse :
    //  - si cashRegisterId fourni, on l'utilise (n'importe quelle caisse, meme d'une autre agence)
    //  - sinon, caisse du jour de l'agence proprietaire de la charge (eventuelle bascule next-day)
    let cashRegister = input.cashRegisterId
      ? await prisma.agencyCashRegister.findUnique({
          where: { id: input.cashRegisterId },
          include: { agency: { select: { organizationId: true } } },
        })
      : await this.cashRegisterRepo.findOrCreateForToday(charge.agencyId);

    if (!cashRegister) {
      throw new NotFoundError('Caisse', input.cashRegisterId ?? '(default)');
    }
    // Si une caisse explicite est fournie, elle doit appartenir au meme tenant.
    if (
      input.cashRegisterId &&
      (cashRegister as { agency?: { organizationId: string } }).agency?.organizationId !== organizationId
    ) {
      throw new NotFoundError('Caisse', input.cashRegisterId);
    }

    if (cashRegister.isClosed) {
      // Cas explicit : caisse choisie deja fermee. On bascule sur la caisse du
      // jour de l'agence destinataire (de la caisse, pas de la charge), pour
      // honorer la regle "post-cloture -> prochain jour ouvrable".
      cashRegister = await this.cashRegisterRepo.findOrCreateForToday(cashRegister.agencyId);
    }

    if (Number(cashRegister.currentBalance) < input.amount) {
      throw new BusinessError(
        `Solde caisse insuffisant (${Number(cashRegister.currentBalance)} dispo) pour payer ${input.amount}.`,
      );
    }

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
        cashRegisterId: cashRegister.id,
      },
    });

    // Debit caisse
    await this.cashRegisterRepo.addExit(cashRegister.id, Number(input.amount));

    // Historique charge
    await prisma.agencyChargeHistory.create({
      data: {
        chargeId: charge.id,
        action: 'PAID',
        userId,
        comment: `Paiement de ${input.amount} (${period}) depuis caisse du ${cashRegister.date.toISOString().slice(0, 10)}`,
        changes: {
          amount: input.amount,
          period,
          cashRegisterId: cashRegister.id,
          cashRegisterAgencyId: cashRegister.agencyId,
          expenseId: expense.id,
        },
      },
    });

    return expense;
  }

  private currentPeriod(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
}
