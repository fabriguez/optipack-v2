// -- Statuts Colis --
export const ParcelStatus = {
  IN_STOCK: 'IN_STOCK',
  LOADING: 'LOADING',
  IN_TRANSIT: 'IN_TRANSIT',
  ARRIVED: 'ARRIVED',
  RECEIVED: 'RECEIVED',
  DELIVERED: 'DELIVERED',
  LOST: 'LOST',
} as const;

export type ParcelStatus = (typeof ParcelStatus)[keyof typeof ParcelStatus];

// -- Statuts Conteneur --
export const ContainerStatus = {
  EMPTY: 'EMPTY',
  LOADING: 'LOADING',
  IN_TRANSIT: 'IN_TRANSIT',
  ARRIVED: 'ARRIVED',
  RECEIVED: 'RECEIVED',
  UNLOADING: 'UNLOADING',
  UNLOADED: 'UNLOADED',
} as const;

export type ContainerStatus = (typeof ContainerStatus)[keyof typeof ContainerStatus];

// -- Types de transit --
export const TransitType = {
  AIR: 'AIR',
  SEA: 'SEA',
  LAND: 'LAND',
} as const;

export type TransitType = (typeof TransitType)[keyof typeof TransitType];

// -- Nature valeur ajoutee route --
export const AddedValueType = {
  AMOUNT: 'AMOUNT',
  PERCENT: 'PERCENT',
} as const;

export type AddedValueType = (typeof AddedValueType)[keyof typeof AddedValueType];

// -- Roles utilisateur --
export const UserRole = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  AGENT: 'AGENT',
  COMPTABLE: 'COMPTABLE',
  MAGASINIER: 'MAGASINIER',
  SUPERVISEUR: 'SUPERVISEUR',
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

// -- Modes de paiement --
export const PaymentMethod = {
  CASH: 'CASH',
  MOBILE_MONEY: 'MOBILE_MONEY',
  BANK_TRANSFER: 'BANK_TRANSFER',
  CARD: 'CARD',
  CHECK: 'CHECK',
} as const;

export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

// -- Statut facture --
export const InvoiceStatus = {
  UNPAID: 'UNPAID',
  PARTIAL: 'PARTIAL',
  PAID: 'PAID',
  CANCELLED: 'CANCELLED',
} as const;

export type InvoiceStatus = (typeof InvoiceStatus)[keyof typeof InvoiceStatus];

// -- Statut bordereau --
export const ManifestStatus = {
  ACTIVE: 'ACTIVE',
  ARCHIVED: 'ARCHIVED',
  CANCELLED: 'CANCELLED',
} as const;

export type ManifestStatus = (typeof ManifestStatus)[keyof typeof ManifestStatus];

// -- Type bordereau --
export const ManifestType = {
  DISPATCH: 'DISPATCH',
  RECEPTION: 'RECEPTION',
} as const;

export type ManifestType = (typeof ManifestType)[keyof typeof ManifestType];

// -- Palier fidelite --
export const LoyaltyTier = {
  STANDARD: 'STANDARD',
  SILVER: 'SILVER',
  GOLD: 'GOLD',
  VIP: 'VIP',
} as const;

export type LoyaltyTier = (typeof LoyaltyTier)[keyof typeof LoyaltyTier];

// -- Type notification --
export const NotificationType = {
  EMAIL: 'EMAIL',
  SMS: 'SMS',
  WHATSAPP: 'WHATSAPP',
  PUSH: 'PUSH',
  IN_APP: 'IN_APP',
} as const;

export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

// -- Statut notification --
export const NotificationStatus = {
  PENDING: 'PENDING',
  SENT: 'SENT',
  FAILED: 'FAILED',
  READ: 'READ',
} as const;

export type NotificationStatus = (typeof NotificationStatus)[keyof typeof NotificationStatus];

// -- Type compte comptable --
export const AccountType = {
  ASSET: 'ASSET',
  LIABILITY: 'LIABILITY',
  EQUITY: 'EQUITY',
  REVENUE: 'REVENUE',
  EXPENSE: 'EXPENSE',
} as const;

export type AccountType = (typeof AccountType)[keyof typeof AccountType];

// -- Source ecriture comptable --
export const JournalSourceType = {
  PAYMENT: 'PAYMENT',
  DISBURSEMENT: 'DISBURSEMENT',
  TRANSFER: 'TRANSFER',
  EXPENSE: 'EXPENSE',
  PENALTY: 'PENALTY',
  SALARY: 'SALARY',
} as const;

export type JournalSourceType = (typeof JournalSourceType)[keyof typeof JournalSourceType];

// -- Type transfert destination --
export const TransferDestinationType = {
  HQ: 'HQ',
  BANK: 'BANK',
  AGENCY: 'AGENCY',
} as const;

export type TransferDestinationType =
  (typeof TransferDestinationType)[keyof typeof TransferDestinationType];

// -- Statut transfert --
export const TransferStatus = {
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  VOIDED: 'VOIDED',
} as const;

export type TransferStatus = (typeof TransferStatus)[keyof typeof TransferStatus];

// -- Statut dette (legacy) --
// La verite metier est maintenant dans schemas/debt.schema.ts (DebtStatusValues),
// qui inclut aussi LITIGATED et CANCELLED. Ce const est conserve pour la
// retro-compat mais n'est plus re-exporte depuis index.ts pour eviter le
// conflit de noms avec le z.enum du schema.
const DebtStatusLegacy = {
  ACTIVE: 'ACTIVE',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  CLEARED: 'CLEARED',
  OVERDUE: 'OVERDUE',
} as const;
export { DebtStatusLegacy };

// -- Type transaction fidelite --
export const LoyaltyTransactionType = {
  EARNED: 'EARNED',
  REDEEMED: 'REDEEMED',
  EXPIRED: 'EXPIRED',
  ADJUSTED: 'ADJUSTED',
} as const;

export type LoyaltyTransactionType =
  (typeof LoyaltyTransactionType)[keyof typeof LoyaltyTransactionType];

// -- Actions d'audit --
export const AuditAction = {
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  VOID: 'VOID',
  EXPORT: 'EXPORT',
  PAYMENT: 'PAYMENT',
  DISBURSEMENT: 'DISBURSEMENT',
  TRANSFER: 'TRANSFER',
} as const;

export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

// -- Statut routage inter-agence --
export const RoutingStatus = {
  PENDING: 'PENDING',
  IN_TRANSIT: 'IN_TRANSIT',
  DELIVERED: 'DELIVERED',
} as const;

export type RoutingStatus = (typeof RoutingStatus)[keyof typeof RoutingStatus];

// -- Type expéditeur chat --
export const ChatSenderType = {
  CLIENT: 'CLIENT',
  AGENT: 'AGENT',
} as const;

export type ChatSenderType = (typeof ChatSenderType)[keyof typeof ChatSenderType];

// -- Statut conversation --
export const ConversationStatus = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
} as const;

export type ConversationStatus = (typeof ConversationStatus)[keyof typeof ConversationStatus];
