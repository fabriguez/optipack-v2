import { z } from 'zod';

export const createClientSchema = z.object({
  fullName: z.string().min(2, 'Le nom doit contenir au moins 2 caracteres'),
  phone: z.string().min(8, 'Numero de telephone invalide'),
  email: z.string().email('Email invalide').optional().or(z.literal('')),
  address: z.string().optional().or(z.literal('')),
  agencyId: z.string().uuid('ID agence invalide'),
});

export const updateClientSchema = createClientSchema.partial();

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
