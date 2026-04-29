import { AppBadge } from '@/components/ui/AppBadge';

const PARCEL_STATUS_MAP: Record<string, { label: string; variant: 'success' | 'warning' | 'error' | 'info' | 'default' }> = {
  IN_STOCK: { label: 'En stock', variant: 'default' },
  LOADING: { label: 'En chargement', variant: 'info' },
  IN_TRANSIT: { label: 'En transit', variant: 'warning' },
  ARRIVED: { label: 'Arrive', variant: 'info' },
  RECEIVED: { label: 'Receptionne', variant: 'success' },
  DELIVERED: { label: 'Livre', variant: 'success' },
  LOST: { label: 'Perdu', variant: 'error' },
};

// Audit fix #3 : conteneur reduit a 5 statuts
const CONTAINER_STATUS_MAP: Record<string, { label: string; variant: 'success' | 'warning' | 'error' | 'info' | 'default' }> = {
  EMPTY: { label: 'Vide', variant: 'default' },
  LOADING: { label: 'En chargement', variant: 'info' },
  IN_TRANSIT: { label: 'En transit', variant: 'warning' },
  RECEIVED: { label: 'Receptionne', variant: 'success' },
  UNLOADED: { label: 'Decharge', variant: 'default' },
  // Compat ascendante (ancien dataset eventuel)
  ARRIVED: { label: 'Receptionne', variant: 'success' },
  UNLOADING: { label: 'Receptionne', variant: 'success' },
};

const INVOICE_STATUS_MAP: Record<string, { label: string; variant: 'success' | 'warning' | 'error' | 'info' | 'default' }> = {
  UNPAID: { label: 'Non paye', variant: 'error' },
  PARTIAL: { label: 'Partiellement paye', variant: 'warning' },
  PAID: { label: 'Solde', variant: 'success' },
  CANCELLED: { label: 'Annule', variant: 'default' },
};

interface StatusBadgeProps {
  status: string;
  type: 'parcel' | 'container' | 'invoice';
}

export function StatusBadge({ status, type }: StatusBadgeProps) {
  const map = type === 'parcel' ? PARCEL_STATUS_MAP : type === 'container' ? CONTAINER_STATUS_MAP : INVOICE_STATUS_MAP;
  const config = map[status] || { label: status, variant: 'default' as const };

  return <AppBadge variant={config.variant}>{config.label}</AppBadge>;
}
