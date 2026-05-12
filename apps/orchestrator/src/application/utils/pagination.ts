import {
  paginationQuerySchema,
  paginated,
  type PaginationQuery,
  type PaginatedResponse,
} from '@transitsoftservices/ops-schemas';
import type { Request } from 'express';

/**
 * Parse req.query avec le schema de pagination commun, en mode permissif :
 * - valeurs invalides -> defauts (pas de 400 inutile sur ?page=foo)
 * - autres params de filtre passent au through et sont gerees par le caller.
 */
export function parsePagination(req: Request): PaginationQuery {
  const r = paginationQuerySchema.safeParse(req.query);
  if (r.success) return r.data;
  return paginationQuerySchema.parse({});
}

/** Calcule skip/take pour Prisma a partir de la pagination. */
export function toPrismaPagination(p: PaginationQuery): { skip: number; take: number } {
  return { skip: (p.page - 1) * p.pageSize, take: p.pageSize };
}

export { paginated };
export type { PaginatedResponse, PaginationQuery };
