/**
 * Libelles FR pour les enums backend. Affichage human-readable
 * partout dans l'app (Badge, listing, detail).
 */

export const PARCEL_STATUS_LABEL: Record<string, string> = {
  IN_STOCK: 'En stock',
  LOADING: 'En chargement',
  IN_TRANSIT: 'En transit',
  ARRIVED: 'Arrive',
  RECEIVED: 'Receptionne',
  DELIVERED: 'Livre',
  LOST: 'Perdu',
};

export function parcelStatusLabel(status?: string | null): string {
  if (!status) return '—';
  return PARCEL_STATUS_LABEL[status] ?? status;
}

export const INVOICE_STATUS_LABEL: Record<string, string> = {
  UNPAID: 'Impayee',
  PARTIAL: 'Partielle',
  PAID: 'Payee',
  CANCELLED: 'Annulee',
};

export function invoiceStatusLabel(status?: string | null): string {
  if (!status) return '—';
  return INVOICE_STATUS_LABEL[status] ?? status;
}

export const DEBT_STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Active',
  PARTIALLY_PAID: 'Partielle',
  CLEARED: 'Soldee',
  OVERDUE: 'En retard',
  LITIGATED: 'Litige',
  CANCELLED: 'Annulee',
};
