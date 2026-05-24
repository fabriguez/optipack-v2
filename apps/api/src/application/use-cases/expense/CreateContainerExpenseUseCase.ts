import { inject, injectable } from 'tsyringe';
import type { Prisma } from '@prisma/client';
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
 *
 * Propagation forwarding : si le conteneur est un conteneur d'acheminement
 * (isForwarding=true), la depense est repartie proportionnellement aux prix
 * de colis snapshotes vers les conteneurs parents (ContainerForwardingParcel
 * Link). Chaque parent recoit une copie automatique (parentExpenseId pointe
 * sur l'originale, isAutoFromForwarding=true). La cloture des parents est
 * bypass pour permettre la propagation meme apres cloture.
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
      select: {
        id: true,
        designation: true,
        departureAgencyId: true,
        isForwarding: true,
        status: true,
        expensesClosedAt: true,
      },
    });
    if (!container) throw new NotFoundError('Conteneur', input.containerId);

    // Cloture : refus si l'utilisateur ajoute une depense manuelle sur un
    // conteneur cloture (la propagation auto bypass via PropagateForwarding
    // Expense en interne).
    if (container.expensesClosedAt) {
      throw new BusinessError(
        'Les depenses de ce conteneur sont cloturees. Aucune nouvelle depense ne peut etre ajoutee manuellement.',
      );
    }

    const agencyId = input.agencyId ?? container.departureAgencyId;

    return prisma.$transaction(async (tx) => {
      const expense = await tx.expense.create({
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

      // Propagation aux parents UNIQUEMENT si forwarding ET deja parti
      // (IN_TRANSIT ou au-dela). Avant le depart, le contenu peut encore
      // changer ; on attend le depart pour figer la repartition. Si la
      // depense est ajoutee post-depart (incl. apres reception/dechargement),
      // on propage immediatement.
      const POST_DEPARTURE = new Set(['IN_TRANSIT', 'RECEIVED', 'UNLOADED']);
      if (container.isForwarding && POST_DEPARTURE.has(container.status)) {
        await propagateForwardingExpense(tx, expense.id, container.id, input.amount, userId);
      }

      return expense;
    });
  }
}

/**
 * Repartit le montant d'une depense forwarding sur les conteneurs parents
 * au prorata des prix snapshotes des colis. Cree N expenses auto (un par
 * parent ayant des colis). Bypass cloture (auto = autorise apres cloture).
 *
 * Exporte pour reutilisation par UpdateExpense (recreation apres edit).
 */
export async function propagateForwardingExpense(
  tx: Prisma.TransactionClient,
  parentExpenseId: string,
  forwardingContainerId: string,
  totalAmount: number,
  userId: string,
): Promise<void> {
  const links = await tx.containerForwardingParcelLink.findMany({
    where: { forwardingId: forwardingContainerId },
    select: {
      parentId: true,
      parcelPriceSnapshot: true,
      parent: { select: { id: true, designation: true, departureAgencyId: true } },
    },
  });
  if (links.length === 0) return;

  // Somme prix par parent + total.
  const sumByParent = new Map<string, { sum: number; designation: string; agencyId: string }>();
  let totalSum = 0;
  for (const l of links) {
    const price = Number(l.parcelPriceSnapshot);
    totalSum += price;
    const cur = sumByParent.get(l.parentId);
    if (cur) cur.sum += price;
    else
      sumByParent.set(l.parentId, {
        sum: price,
        designation: l.parent.designation,
        agencyId: l.parent.departureAgencyId,
      });
  }
  if (totalSum <= 0) return;

  // Recupere la depense originale pour clone des metadonnees.
  const orig = await tx.expense.findUnique({
    where: { id: parentExpenseId },
    select: { title: true, reason: true, description: true, category: true },
  });
  if (!orig) return;

  for (const [parentId, info] of sumByParent) {
    const share = totalAmount * (info.sum / totalSum);
    if (share <= 0) continue;
    await tx.expense.create({
      data: {
        agencyId: info.agencyId,
        title: `${orig.title} (auto)`,
        reason: orig.reason,
        description:
          (orig.description ? orig.description + '\n' : '') +
          `[AUTO] Depense propagee depuis conteneur d'acheminement (proportion ${(info.sum / totalSum * 100).toFixed(2)}%).`,
        category: orig.category ?? 'CONTAINER',
        amount: share,
        containerId: parentId,
        approvedByUserId: userId,
        isPaid: false,
        parentExpenseId,
        isAutoFromForwarding: true,
      },
    });
  }
}
