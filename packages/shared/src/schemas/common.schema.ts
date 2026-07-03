import { z } from 'zod';

export const paginationSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(200).default(20),
    // sortBy reste une string libre ici : l'allowlist par modele est appliquee
    // au niveau des repositories via safeOrderBy() (choke point fiable), qui
    // retombe sur un tri par defaut si le champ demande n'est pas autorise.
    // Ne PAS ordonner par un champ arbitraire sans passer par ce helper : risque
    // de fuite d'info (ordre revelateur) ou d'erreur Prisma (champ inconnu).
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
    search: z.string().optional(),
  })
  // passthrough() : les filtres metiers (warehouseId, containerId, status, onlyPresent, ...)
  // sont lus directement depuis req.query par chaque controller. On les conserve donc
  // au lieu de les dropper silencieusement, ce qui faisait que les listings ignoraient
  // les filtres specifiques et retournaient toute la table.
  .passthrough();

export const idParamSchema = z.object({
  id: z.string().uuid('ID invalide'),
});

export const dateRangeSchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export type PaginationInput = z.infer<typeof paginationSchema>;
export type IdParam = z.infer<typeof idParamSchema>;
export type DateRangeInput = z.infer<typeof dateRangeSchema>;

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
