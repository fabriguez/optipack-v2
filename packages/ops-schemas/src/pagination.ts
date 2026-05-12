import { z } from 'zod';

/**
 * Schema query string pagination commun a tous les listings orchestrator.
 * Express recoit des strings (req.query), zod coerce vers number/booleans.
 */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  /** Filtre texte libre, applique cote backend selon le type de ressource. */
  q: z.string().optional(),
  /** Champ de tri (ex: "createdAt", "name"). */
  sort: z.string().optional(),
  /** Direction du tri. */
  order: z.enum(['asc', 'desc']).optional().default('desc'),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/** Metadata de pagination renvoyee dans chaque listing. */
export interface PaginationMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function buildMeta(total: number, page: number, pageSize: number): PaginationMeta {
  return {
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** Forme d'une reponse paginee. */
export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

/**
 * Helper : recoit un total + une slice + page/pageSize et renvoie l'objet
 * final pret a etre envoye via res.json({ success: true, ...result }).
 *
 * (Note : la slice doit deja avoir ete faite cote DB pour la perf, on calcule
 * juste le wrapper meta ici.)
 */
export function paginated<T>(
  data: T[],
  total: number,
  page: number,
  pageSize: number,
): PaginatedResponse<T> {
  return { data, meta: buildMeta(total, page, pageSize) };
}
