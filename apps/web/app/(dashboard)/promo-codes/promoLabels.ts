/** Libelles francais des enums codes promo, partages par la liste et le detail. */

export const PARCEL_CATEGORY_LABELS: Record<string, string> = {
  STANDARD: 'Standard',
  DOCUMENT: 'Document',
  FOOD: 'Alimentaire',
  ELECTRONICS: 'Electronique',
  CLOTHING: 'Vetements',
  OTHER: 'Autre',
};

export const TRANSIT_TYPE_LABELS: Record<string, string> = {
  AIR: 'Aerien',
  SEA: 'Maritime',
  LAND: 'Terrestre',
};

export const VISIBILITY_LABELS: Record<string, string> = {
  PUBLIC: 'Public',
  PRIVATE: 'Prive',
  ASSIGNED: 'Sur attribution',
};

export const VISIBILITY_HINTS: Record<string, string> = {
  PUBLIC: 'Affiche sur la page promotions du site et utilisable par tous les clients.',
  PRIVATE: 'Non liste : seul un client a qui vous communiquez le code peut l\'utiliser.',
  ASSIGNED: 'Utilisable uniquement par les clients auxquels vous attribuez le code.',
};

export const REDEMPTION_STATUS_LABELS: Record<string, string> = {
  RESERVED: 'Reserve',
  CONSUMED: 'Consomme',
  RELEASED: 'Libere',
};

export const REDEMPTION_STATUS_VARIANTS: Record<string, 'success' | 'warning' | 'default'> = {
  CONSUMED: 'success',
  RESERVED: 'warning',
  RELEASED: 'default',
};

/** "-10%" ou "-2 000 FCFA" selon le type de remise. */
export function formatDiscount(type: string, value: number | string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return type === 'PERCENT' ? `-${n}%` : `-${n.toLocaleString('fr-FR')} FCFA`;
}

/** Fenetre de validite lisible : "Du 01/08 au 31/08", "Jusqu'au ...", "Permanent". */
export function formatValidity(startsAt: string | null, expiresAt: string | null): string {
  const fmt = (d: string) => new Date(d).toLocaleDateString('fr-FR');
  if (startsAt && expiresAt) return `Du ${fmt(startsAt)} au ${fmt(expiresAt)}`;
  if (expiresAt) return `Jusqu'au ${fmt(expiresAt)}`;
  if (startsAt) return `A partir du ${fmt(startsAt)}`;
  return 'Permanent';
}

/** Intervalle de tarifs lisible, "-" si aucune borne. */
export function formatAmountRange(
  min: number | string | null,
  max: number | string | null,
): string {
  const f = (v: number | string) => `${Number(v).toLocaleString('fr-FR')} FCFA`;
  if (min != null && max != null) return `${f(min)} - ${f(max)}`;
  if (min != null) return `A partir de ${f(min)}`;
  if (max != null) return `Jusqu'a ${f(max)}`;
  return '-';
}

/** "3 / 100" ou "12" quand le code est illimite. */
export function formatUsage(usedCount: number, maxUses: number | null): string {
  return maxUses == null ? `${usedCount}` : `${usedCount} / ${maxUses}`;
}

/** Date ISO -> valeur d'un <input type="date">, chaine vide si absente. */
export function toDateInput(iso: string | null | undefined): string {
  return iso ? new Date(iso).toISOString().slice(0, 10) : '';
}
