import { z } from 'zod';

export const createParcelSchema = z.object({
  designation: z.string().min(2, 'La designation doit contenir au moins 2 caracteres'),
  weight: z.number().positive('La masse doit etre positive'),
  volume: z.number().positive('Le volume doit etre positif').optional(),
  destination: z.string().min(2, 'La destination est requise'),
  observation: z.string().optional().or(z.literal('')),
  clientId: z.string().uuid('ID client invalide'),
  recipientId: z.string().uuid('ID destinataire invalide').optional(),
  warehouseId: z.string().uuid('ID magasin invalide'),
  transitRouteId: z.string().uuid('ID route de transit invalide'),
});

export const updateParcelSchema = z.object({
  designation: z.string().min(2).optional(),
  weight: z.number().positive().optional(),
  volume: z.number().positive().optional(),
  destination: z.string().min(2).optional(),
  observation: z.string().optional(),
  recipientId: z.string().uuid().optional().nullable(),
});

export type CreateParcelInput = z.infer<typeof createParcelSchema>;
export type UpdateParcelInput = z.infer<typeof updateParcelSchema>;
