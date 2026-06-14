export * from './enums';
export * from './permissionDescriptions';

// Transitions de statut valides pour les colis.
// LOST est cible valide depuis tout statut non-terminal (perte detectee a
// n'importe quel moment du transit). DELIVERED/LOST = terminaux.
export const VALID_PARCEL_TRANSITIONS: Record<string, string[]> = {
  IN_STOCK: ['LOADING', 'LOST'],
  LOADING: ['IN_STOCK', 'IN_TRANSIT', 'LOST'],
  IN_TRANSIT: ['ARRIVED', 'LOST'],
  ARRIVED: ['RECEIVED', 'LOST'],
  RECEIVED: ['IN_STOCK', 'DELIVERED', 'LOST'],
  DELIVERED: [],
  LOST: [],
};

// Transitions de statut valides pour les conteneurs
export const VALID_CONTAINER_TRANSITIONS: Record<string, string[]> = {
  EMPTY: ['LOADING'],
  LOADING: ['IN_TRANSIT', 'EMPTY'],
  IN_TRANSIT: ['ARRIVED'],
  ARRIVED: ['RECEIVED'],
  RECEIVED: ['UNLOADING'],
  UNLOADING: ['UNLOADED'],
  UNLOADED: ['EMPTY'],
};

// Jours avant penalite
export const PENALTY_GRACE_DAYS = 10;

// Points de fidelite par FCFA depense
export const LOYALTY_POINTS_PER_UNIT = 1; // 1 point pour 1000 FCFA
export const LOYALTY_POINTS_DIVISOR = 1000;

// Seuils de palier fidelite
export const LOYALTY_TIER_THRESHOLDS = {
  STANDARD: 0,
  SILVER: 500,
  GOLD: 2000,
  VIP: 5000,
} as const;

// Reductions par palier (en pourcentage)
export const LOYALTY_TIER_DISCOUNTS = {
  STANDARD: 0,
  SILVER: 3,
  GOLD: 5,
  VIP: 10,
} as const;

// Pagination par defaut
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
