import { z } from 'zod';

export const createRecipientSchema = z.object({
  fullName: z.string().min(2, 'Le nom doit contenir au moins 2 caracteres'),
  phone: z.string().min(8, 'Numero de telephone invalide'),
  email: z.string().email('Email invalide').optional().or(z.literal('')),
  idNumber: z.string().optional().or(z.literal('')),
  agencyId: z.string().uuid('ID agence invalide'),
});

export const updateRecipientSchema = createRecipientSchema.partial();

export type CreateRecipientInput = z.infer<typeof createRecipientSchema>;
export type UpdateRecipientInput = z.infer<typeof updateRecipientSchema>;
