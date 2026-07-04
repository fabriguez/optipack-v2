import { LOYALTY_POINTS_DIVISOR, LOYALTY_TIER_THRESHOLDS, type LoyaltyTier } from '../constants/index';

/**
 * Genere un numero de tracking unique
 * Format: OP-YYYYMMDD-XXXXX (ex: OP-20260409-A3B7K)
 */
export function generateTrackingNumber(): string {
  const date = new Date();
  const dateStr =
    date.getFullYear().toString() +
    (date.getMonth() + 1).toString().padStart(2, '0') +
    date.getDate().toString().padStart(2, '0');
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 5; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `OP-${dateStr}-${suffix}`;
}

/**
 * Genere une reference unique pour les documents financiers
 * Format: PREFIX-YYYYMMDD-NNNN (ex: FAC-20260409-0001)
 */
export function generateReference(prefix: string, sequence: number): string {
  const date = new Date();
  const dateStr =
    date.getFullYear().toString() +
    (date.getMonth() + 1).toString().padStart(2, '0') +
    date.getDate().toString().padStart(2, '0');
  return `${prefix}-${dateStr}-${sequence.toString().padStart(4, '0')}`;
}

/**
 * Calcule les points de fidelite pour un montant donne
 */
export function calculateLoyaltyPoints(amount: number): number {
  return Math.floor(amount / LOYALTY_POINTS_DIVISOR);
}

/**
 * Determine le palier de fidelite en fonction des points
 */
export function getLoyaltyTier(points: number): LoyaltyTier {
  if (points >= LOYALTY_TIER_THRESHOLDS.VIP) return 'VIP';
  if (points >= LOYALTY_TIER_THRESHOLDS.GOLD) return 'GOLD';
  if (points >= LOYALTY_TIER_THRESHOLDS.SILVER) return 'SILVER';
  return 'STANDARD';
}

/**
 * Formate un montant avec separateur de milliers
 */
export function formatAmount(amount: number, currency = 'XAF'): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Formate une date au format francais.
 *
 * `timeZone` (IANA, ex 'Africa/Douala') force l'affichage dans le fuseau
 * cible au lieu du fuseau du runtime (navigateur / serveur). Convention
 * projet : le serveur fait foi, les ecrans affichent dans le fuseau de
 * l'agence concernee ('UTC' pour les champs @db.Date encodes UTC midnight).
 */
export function formatDate(date: Date | string, timeZone?: string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...(timeZone ? { timeZone } : {}),
  }).format(d);
}

/**
 * Formate une date avec l'heure. Cf `formatDate` pour `timeZone`.
 */
export function formatDateTime(date: Date | string, timeZone?: string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  }).format(d);
}

/**
 * Formate une duree ecoulee depuis une date donnee jusqu'a maintenant
 * Ex: "2 j", "5 h", "12 min", "<1 min"
 */
export function formatDurationSince(date: Date | string | null | undefined): string {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  const ms = Date.now() - d.getTime();
  if (ms < 0) return '<1 min';
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return '<1 min';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} j`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} mois`;
  const years = Math.floor(days / 365);
  return `${years} an${years > 1 ? 's' : ''}`;
}
