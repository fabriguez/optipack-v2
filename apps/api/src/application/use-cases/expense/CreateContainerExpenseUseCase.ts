import { inject, injectable } from 'tsyringe';
import { prisma } from '../../../config/database';
import { NotFoundError, BusinessError } from '../../../domain/errors/BusinessError';

interface Input {
  containerId: string;
  agencyId?: string;
  title: string;
  reason: string;
  description?: string;
  category?: string;
  amount: number;
  receiptUrl?: string;
  justificationUrl?: string;
}

/**
 * Cree une depense imputee a un conteneur. La depense est en statut non
 * payee : aucun debit caisse n'est realise ici. PayContainerExpenseUseCase
 * est utilise par la suite pour solder la depense depuis une caisse precise.
 *
 * Si agencyId n'est pas fourni, on utilise l'agence de depart du conteneur
 * comme rattachement comptable par defaut.
 */
@injectable()
export class CreateContainerExpenseUseCase {
  // eslint-disable-next-line @typescript-eslint/no-empty-function, @typescript-eslint/no-useless-constructor
  constructor() {}

  async execute(input: Input, userId: string) {
    if (input.amount <= 0) throw new BusinessError('Le montant doit etre superieur a zero.');
    if (!input.title?.trim()) throw new BusinessError('Le titre est obligatoire.');

    const container = await prisma.container.findUnique({
      where: { id: input.containerId },
      select: { id: true, designation: true, departureAgencyId: true },
    });
    if (!container) throw new NotFoundError('Conteneur', input.containerId);

    const agencyId = input.agencyId ?? container.departureAgencyId;

    return prisma.expense.create({
      data: {
        agencyId,
        title: input.title.trim(),
        reason: input.reason || `Depense conteneur ${container.designation}`,
        description: input.description ?? null,
        category: input.category ?? 'CONTAINER',
        amount: input.amount,
        receiptUrl: input.receiptUrl ?? null,
        justificationUrl: input.justificationUrl ?? null,
        containerId: container.id,
        approvedByUserId: userId,
        isPaid: false,
      },
    });
  }
}
