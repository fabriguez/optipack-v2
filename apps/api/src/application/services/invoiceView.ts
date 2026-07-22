/**
 * Champs d'affichage financiers derives d'une facture, en tenant compte du
 * magasinage NON encore cristallise (`pendingStorage`).
 *
 * Source de verite unique cote lecture pour ne pas double-compter : netAmount
 * et balance contiennent DEJA le magasinage cristallise ; on n'ajoute que le
 * pending.
 *
 *   displayTotal    = netAmount + pending      (total a payer, magasinage inclus)
 *   amountDue       = max(0, balance + pending) (reste du a encaisser)
 *   effectiveStatus = PARTIAL/UNPAID tant qu'il reste du magasinage a payer,
 *                     meme si `status` DB est encore PAID entre deux cron.
 */
export function deriveInvoiceView(
  invoice: { netAmount: unknown; balance: unknown; paidAmount: unknown; status: string },
  pendingStorage: number,
): {
  pendingStorageFees: number;
  displayTotal: number;
  amountDue: number;
  effectiveStatus: 'UNPAID' | 'PARTIAL' | 'PAID' | 'CANCELLED';
} {
  const netAmount = Number(invoice.netAmount ?? 0);
  const balance = Number(invoice.balance ?? 0);
  const paidAmount = Number(invoice.paidAmount ?? 0);
  const pending = Math.max(0, pendingStorage);
  const amountDue = Math.max(0, balance + pending);
  const effectiveStatus =
    invoice.status === 'CANCELLED'
      ? 'CANCELLED'
      : amountDue <= 0
        ? 'PAID'
        : paidAmount > 0
          ? 'PARTIAL'
          : 'UNPAID';
  return {
    pendingStorageFees: pending,
    displayTotal: netAmount + pending,
    amountDue,
    effectiveStatus,
  };
}
