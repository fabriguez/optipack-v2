/**
 * Libelles FR pour les enums backend. Miroir du portail mobile (apps/mobile/lib/labels.ts)
 * pour un affichage human-readable cote web-client.
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

interface AgencyRef {
  name?: string | null;
  city?: string | null;
}
interface ContainerRef {
  departureAgency?: AgencyRef | null;
  arrivalAgency?: AgencyRef | null;
}
export interface ParcelStatusContextLike {
  status?: string | null;
  container?: ContainerRef | null;
  lastContainer?: ContainerRef | null;
  transitRoute?: { departureCity?: string | null; arrivalCity?: string | null } | null;
  destinationAgency?: AgencyRef | null;
  destination?: string | null;
  origin?: string | null;
}

function agencyName(a?: AgencyRef | null, fallback?: string | null): string | null {
  if (a?.name) return `${a.name}${a.city ? ` (${a.city})` : ''}`;
  return fallback ?? null;
}

/**
 * Libelle contextuel du trajet, cote client (web + mobile alignes) :
 *   IN_TRANSIT -> "En transit de <depart conteneur> vers <arrivee conteneur>"
 *   ARRIVED    -> "Arrive a <arrivee conteneur>"
 * Pour tout autre statut : libelle nu (parcelStatusLabel).
 */
export function parcelStatusContextLabel(p?: ParcelStatusContextLike | null): string {
  if (!p) return '—';
  const ct = p.container ?? p.lastContainer;
  switch (p.status) {
    case 'IN_TRANSIT': {
      const dep = agencyName(ct?.departureAgency, p.transitRoute?.departureCity ?? p.origin);
      const arr = agencyName(
        ct?.arrivalAgency,
        p.transitRoute?.arrivalCity ?? p.destinationAgency?.city ?? p.destination,
      );
      return `En transit de ${dep ?? '—'} vers ${arr ?? '—'}`;
    }
    case 'ARRIVED': {
      const arr = agencyName(ct?.arrivalAgency, p.destinationAgency?.name ?? p.destination);
      return `Arrive a ${arr ?? '—'}`;
    }
    default:
      return parcelStatusLabel(p.status);
  }
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

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  CASH: 'Especes',
  MOBILE_MONEY: 'Mobile Money',
  BANK_TRANSFER: 'Virement',
  CARD: 'Carte',
  CHECK: 'Cheque',
  OTHER: 'Autre',
};

export function paymentMethodLabel(m?: string | null): string {
  if (!m) return '—';
  return PAYMENT_METHOD_LABEL[m] ?? m;
}

export const PARCEL_ACTION_LABEL: Record<string, string> = {
  CREATED: 'Colis cree',
  UPDATED: 'Colis modifie',
  DELETED: 'Colis supprime',
  ARCHIVED: 'Colis archive',
  CANCELLED: 'Colis annule',
  IMAGE_ADDED: 'Photo ajoutee',
  IMAGE_REMOVED: 'Photo retiree',
  DOCUMENT_ADDED: 'Document ajoute',
  DOCUMENT_REMOVED: 'Document retire',
  LOADED_INTO_CONTAINER: 'Charge dans un conteneur',
  PARCELS_LOADED: 'Conteneur rempli',
  PARCEL_REMOVED: 'Retire du conteneur',
  CONTAINER_DEPARTED: 'Conteneur parti',
  CONTAINER_ARRIVED: 'Conteneur arrive',
  DEPARTED: 'Depart effectue',
  RECEIVED: 'Receptionne',
  HANDED_OVER: 'Remis au destinataire',
  MARKED_MISSING: 'Marque manquant',
  INVENTORY_REGISTERED: 'Inventaire enregistre',
  INVOICE_GENERATED: 'Facture generee',
  PAYMENT_RECORDED: 'Paiement enregistre',
  PAID: 'Paye',
  ADVANCE_PAID: 'Acompte verse',
  DISCOUNT_APPLIED: 'Remise appliquee',
  ADJUSTED: 'Ajuste',
  DEBT_OPENED: 'Dette ouverte',
};

export function parcelActionLabel(action?: string | null): string {
  if (!action) return '—';
  if (action.startsWith('STATUS_CHANGE_')) {
    return `Passe en : ${parcelStatusLabel(action.replace('STATUS_CHANGE_', ''))}`;
  }
  return PARCEL_ACTION_LABEL[action] ?? action.replace(/_/g, ' ').toLowerCase();
}

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

/** Tone (bg/fg) par statut colis, aligne sur le listing. */
export const PARCEL_STATUS_TONE: Record<string, { bg: string; fg: string }> = {
  IN_STOCK: { bg: 'rgba(59,130,246,0.15)', fg: '#2563eb' },
  LOADING: { bg: 'rgba(234,179,8,0.15)', fg: '#ca8a04' },
  IN_TRANSIT: { bg: 'rgba(168,85,247,0.15)', fg: '#9333ea' },
  ARRIVED: { bg: 'rgba(16,185,129,0.15)', fg: '#059669' },
  RECEIVED: { bg: 'rgba(16,185,129,0.15)', fg: '#059669' },
  DELIVERED: { bg: 'rgba(34,197,94,0.15)', fg: '#16a34a' },
  LOST: { bg: 'rgba(244,63,94,0.12)', fg: '#e11d48' },
};
