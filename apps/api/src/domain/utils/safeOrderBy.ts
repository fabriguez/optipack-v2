/**
 * Construit un objet `orderBy` Prisma sur (avec allowlist) a partir d'un
 * `sortBy` provenant du client (non fiable).
 *
 * Contexte securite : `paginationSchema.sortBy` est un `z.string()` libre.
 * Sans controle, un client pouvait ordonner par n'importe quelle colonne ou
 * relation reelle du modele (fuite d'info par ordre de tri) ou par un champ
 * inexistant (Prisma leve une erreur -> surface DoS / info-leak). Ce helper
 * est le point de controle fiable cote repository : on n'accepte que les
 * colonnes scalaires explicitement listees, et on retombe sur `fallback` sinon.
 *
 * @param sortBy    Champ demande par le client (potentiellement invalide).
 * @param sortOrder Sens du tri ; par defaut 'desc'.
 * @param allowed   Colonnes scalaires triables autorisees pour ce modele.
 * @param fallback  Colonne de repli (doit figurer dans `allowed` ou etre un
 *                  champ scalaire valide du modele, typiquement `createdAt`).
 */
export function safeOrderBy(
  sortBy: string | undefined,
  sortOrder: 'asc' | 'desc' | undefined,
  allowed: string[],
  fallback: string,
): Record<string, 'asc' | 'desc'> {
  const order: 'asc' | 'desc' = sortOrder === 'asc' ? 'asc' : 'desc';
  const field = sortBy && allowed.includes(sortBy) ? sortBy : fallback;
  return { [field]: order };
}
