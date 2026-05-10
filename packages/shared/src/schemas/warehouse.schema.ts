import { z } from 'zod';

export const createWarehouseSchema = z.object({
  name: z.string().min(2, 'Le nom doit contenir au moins 2 caracteres'),
  agencyId: z.string().uuid('ID agence invalide'),
  location: z.string().min(3, 'Emplacement requis'),
  // Frais de magasinage (calcul automatique cote backend) :
  // - storageFreeDays : nombre de jours offerts apres dechargement
  // - storageDailyRate : tarif journalier (devise de base de l'organisation)
  // Defaut DB : 7 jours / 0 (donc inactif tant que non configure).
  storageFreeDays: z.number().int().nonnegative().optional(),
  storageDailyRate: z.number().nonnegative().optional(),
});

export const updateWarehouseSchema = createWarehouseSchema.omit({ agencyId: true }).partial();

export type CreateWarehouseInput = z.infer<typeof createWarehouseSchema>;
export type UpdateWarehouseInput = z.infer<typeof updateWarehouseSchema>;
