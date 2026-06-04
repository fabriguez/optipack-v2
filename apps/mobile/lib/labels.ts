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

export function debtStatusLabel(s?: string | null): string {
  if (!s) return '—';
  return DEBT_STATUS_LABEL[s] ?? s;
}

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  CASH: 'Espèces',
  MOBILE_MONEY: 'Mobile Money',
  BANK_TRANSFER: 'Virement',
  CARD: 'Carte',
  CHECK: 'Chèque',
  OTHER: 'Autre',
};

export function paymentMethodLabel(m?: string | null): string {
  if (!m) return '—';
  return PAYMENT_METHOD_LABEL[m] ?? m;
}

// Actions historique colis : libelles FR humains.
export const PARCEL_ACTION_LABEL: Record<string, string> = {
  CREATED: 'Colis créé',
  UPDATED: 'Colis modifié',
  DELETED: 'Colis supprimé',
  ARCHIVED: 'Colis archivé',
  CANCELLED: 'Colis annulé',
  IMAGE_ADDED: 'Photo ajoutée',
  IMAGE_REMOVED: 'Photo retirée',
  DOCUMENT_ADDED: 'Document ajouté',
  DOCUMENT_REMOVED: 'Document retiré',
  LOADED_INTO_CONTAINER: 'Chargé dans un conteneur',
  PARCELS_LOADED: 'Conteneur rempli',
  PARCEL_REMOVED: 'Retiré du conteneur',
  CONTAINER_DEPARTED: 'Conteneur parti',
  CONTAINER_ARRIVED: 'Conteneur arrivé',
  DEPARTED: 'Départ effectué',
  RECEIVED: 'Réceptionné',
  HANDED_OVER: 'Remis au destinataire',
  MARKED_MISSING: 'Marqué manquant',
  INVENTORY_REGISTERED: 'Inventaire enregistré',
  INVOICE_GENERATED: 'Facture générée',
  PAYMENT_RECORDED: 'Paiement enregistré',
  PAID: 'Payé',
  ADVANCE_PAID: 'Acompte versé',
  DISCOUNT_APPLIED: 'Remise appliquée',
  ADJUSTED: 'Ajusté',
  DEBT_OPENED: 'Dette ouverte',
  DEBT_AUTO_CREATE_FAILED: 'Création de dette échouée',
  DISPATCH_MANIFEST_CREATED: 'Manifeste créé',
  DISPATCH_MANIFEST_FAILED: 'Manifeste échoué',
  FORWARDING_EXPENSES_PROPAGATED: 'Frais d\'acheminement propagés',
  FORWARDING_EXPENSES_PROPAGATION_FAILED: 'Propagation des frais échouée',
};

export function parcelActionLabel(action?: string | null): string {
  if (!action) return '—';
  if (action.startsWith('STATUS_CHANGE_')) {
    const newStatus = action.replace('STATUS_CHANGE_', '');
    return `Passé en : ${parcelStatusLabel(newStatus)}`;
  }
  return PARCEL_ACTION_LABEL[action] ?? action.replace(/_/g, ' ').toLowerCase();
}

// Mouvements financiers d'un colis : type + libelle/icone/couleur.
export const FINANCIAL_MOVEMENT_LABEL: Record<string, string> = {
  TRANSPORT: 'Frais de transport',
  STORAGE: 'Frais de magasinage',
  PAYMENT: 'Paiement',
  DISCOUNT: 'Remise',
};

export function financialMovementLabel(type?: string | null): string {
  if (!type) return '—';
  return FINANCIAL_MOVEMENT_LABEL[type] ?? type;
}
