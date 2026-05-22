import { injectable } from 'tsyringe';
import { prisma } from '../../config/database';

/**
 * Service de synchronisation des factures de groupe de colis.
 *
 * Modele : chaque colis d'un groupe possede SA propre facture (parcel.invoiceId).
 * Le groupe possede une facture "agregat" (Invoice.parcelGroupId) dont les
 * montants = somme des factures membres. Elle n'est jamais payee directement
 * (le paiement d'un groupe est distribue sur les factures membres) : elle
 * sert de vue consolidee + statut global.
 */
@injectable()
export class GroupInvoiceService {
  /**
   * Recalcule la facture agregat d'un groupe depuis les factures de ses colis.
   * Idempotent. No-op si le groupe n'a pas de facture agregat.
   */
  async sync(groupId: string): Promise<void> {
    const group = await prisma.parcelGroup.findUnique({
      where: { id: groupId },
      include: {
        parcels: { select: { invoiceId: true } },
        invoice: { select: { id: true, status: true } },
      },
    });
    if (!group || !group.invoice) return;

    const aggregateId = group.invoice.id;
    const memberInvoiceIds = [
      ...new Set(group.parcels.map((p) => p.invoiceId).filter((id): id is string => !!id)),
    ].filter((id) => id !== aggregateId);

    if (memberInvoiceIds.length === 0) return;

    const members = await prisma.invoice.findMany({
      where: { id: { in: memberInvoiceIds } },
      select: { totalAmount: true, paidAmount: true },
    });

    const total = members.reduce((s, i) => s + Number(i.totalAmount), 0);
    const paid = members.reduce((s, i) => s + Number(i.paidAmount), 0);
    const balance = Math.max(0, total - paid);
    const status: 'UNPAID' | 'PARTIAL' | 'PAID' =
      balance <= 0 ? 'PAID' : paid > 0 ? 'PARTIAL' : 'UNPAID';

    await prisma.invoice.update({
      where: { id: aggregateId },
      data: { totalAmount: total, netAmount: total, paidAmount: paid, balance, status },
    });

    // Statut groupe : PAID quand tout est solde. On ne retrograde jamais
    // automatiquement un groupe FINALIZED/SENT vers DRAFT.
    if (status === 'PAID') {
      await prisma.parcelGroup.update({ where: { id: groupId }, data: { status: 'PAID' } });
    }
  }

  /**
   * Trouve le groupId d'une facture donnee :
   *  - facture agregat : Invoice.parcelGroupId
   *  - facture membre  : via un colis lie a cette facture qui a un parcelGroupId
   * Retourne null si la facture n'est liee a aucun groupe.
   */
  async resolveGroupId(invoiceId: string): Promise<string | null> {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { parcelGroupId: true },
    });
    if (invoice?.parcelGroupId) return invoice.parcelGroupId;

    const parcel = await prisma.parcel.findFirst({
      where: { invoiceId, parcelGroupId: { not: null } },
      select: { parcelGroupId: true },
    });
    return parcel?.parcelGroupId ?? null;
  }

  /**
   * True si la facture est l'agregat d'un groupe (= ne doit pas etre payee
   * directement : le controleur de paiement distribue sur les membres).
   */
  async isAggregateInvoice(invoiceId: string): Promise<boolean> {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { parcelGroupId: true },
    });
    return !!invoice?.parcelGroupId;
  }

  /**
   * Repartit un montant sur les factures membres non soldees d'un groupe,
   * proportionnellement a leur solde restant. Retourne la liste
   * { invoiceId, amount } a encaisser. La somme des amounts == `amount`
   * (ajustement du reliquat sur la derniere ligne pour eviter les arrondis).
   */
  async splitAmountAcrossMembers(
    groupId: string,
    amount: number,
  ): Promise<Array<{ invoiceId: string; amount: number }>> {
    const group = await prisma.parcelGroup.findUnique({
      where: { id: groupId },
      include: { parcels: { select: { invoiceId: true } }, invoice: { select: { id: true } } },
    });
    if (!group) return [];

    const aggregateId = group.invoice?.id;
    const memberInvoiceIds = [
      ...new Set(group.parcels.map((p) => p.invoiceId).filter((id): id is string => !!id)),
    ].filter((id) => id !== aggregateId);

    const members = await prisma.invoice.findMany({
      where: { id: { in: memberInvoiceIds }, status: { not: 'PAID' } },
      select: { id: true, balance: true },
      orderBy: { createdAt: 'asc' },
    });

    const totalBalance = members.reduce((s, m) => s + Number(m.balance), 0);
    if (totalBalance <= 0) return [];

    const capped = Math.min(amount, totalBalance);
    const result: Array<{ invoiceId: string; amount: number }> = [];
    let allocated = 0;
    members.forEach((m, idx) => {
      const bal = Number(m.balance);
      let share: number;
      if (idx === members.length - 1) {
        share = capped - allocated; // reliquat sur la derniere ligne
      } else {
        share = Math.round((bal / totalBalance) * capped);
      }
      share = Math.min(share, bal);
      if (share > 0) {
        result.push({ invoiceId: m.id, amount: share });
        allocated += share;
      }
    });
    return result;
  }
}

export const GROUP_INVOICE_SERVICE = Symbol.for('GroupInvoiceService');
