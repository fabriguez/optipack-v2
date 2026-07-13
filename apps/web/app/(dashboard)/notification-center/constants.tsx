import type { NotificationChannel, NotificationStatus } from '@/lib/api/notifications';

type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'outline';

/** Libelles FR des canaux. */
export const CHANNEL_LABEL: Record<NotificationChannel, string> = {
  EMAIL: 'Email',
  SMS: 'SMS',
  WHATSAPP: 'WhatsApp',
  PUSH: 'Push',
  IN_APP: 'In-app',
};

/** Variante de badge par canal (vert = WhatsApp, le canal phare). */
export const CHANNEL_VARIANT: Record<NotificationChannel, BadgeVariant> = {
  EMAIL: 'info',
  SMS: 'default',
  WHATSAPP: 'success',
  PUSH: 'warning',
  IN_APP: 'outline',
};

/** Libelles FR des statuts. */
export const STATUS_LABEL: Record<NotificationStatus, string> = {
  PENDING: 'En attente',
  SENT: 'Envoyee',
  FAILED: 'Echec',
  READ: 'Lue',
};

/** Variante de badge par statut. */
export const STATUS_VARIANT: Record<NotificationStatus, BadgeVariant> = {
  SENT: 'success',
  PENDING: 'warning',
  FAILED: 'error',
  READ: 'default',
};

/** Mapping des evenements connus vers un libelle FR lisible. */
export const EVENT_KIND_LABEL: Record<string, string> = {
  PARCEL_CREATED: 'Creation colis',
  PARCEL_ARRIVED: 'Colis arrive',
  PARCEL_DELIVERED: 'Colis livre',
  PARCEL_IN_TRANSIT: 'Colis en transit',
  PAYMENT_RECEIVED: 'Paiement recu',
  INVOICE_CREATED: 'Facture creee',
  INVOICE_PAID: 'Facture reglee',
  CONTAINER_DEPARTED: 'Conteneur parti',
  CONTAINER_ARRIVED: 'Conteneur arrive',
};

/** Resout un eventKind brut en libelle FR (fallback : la valeur brute). */
export function eventKindLabel(kind: string | null | undefined): string {
  if (!kind) return '-';
  return EVENT_KIND_LABEL[kind] ?? kind;
}

/** Options de filtre pour les canaux. */
export const CHANNEL_OPTIONS = (Object.keys(CHANNEL_LABEL) as NotificationChannel[]).map((c) => ({
  value: c,
  label: CHANNEL_LABEL[c],
}));

/** Options de filtre pour les statuts. */
export const STATUS_OPTIONS = (Object.keys(STATUS_LABEL) as NotificationStatus[]).map((s) => ({
  value: s,
  label: STATUS_LABEL[s],
}));

/** Options de filtre pour les objets/evenements connus. */
export const EVENT_KIND_OPTIONS = Object.entries(EVENT_KIND_LABEL).map(([value, label]) => ({
  value,
  label,
}));

/**
 * Un IN_APP ne se renvoie pas (aucun canal externe). Tous les autres statuts
 * (y compris SENT/READ) restent renvoyables : le backend rejoue le meme
 * payload sur le meme canal.
 */
export function canRetry(_status: NotificationStatus, type: NotificationChannel): boolean {
  return type !== 'IN_APP';
}
