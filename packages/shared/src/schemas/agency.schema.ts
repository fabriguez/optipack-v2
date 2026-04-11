import { z } from 'zod';

export const createAgencySchema = z.object({
  name: z.string().min(2, 'Le nom doit contenir au moins 2 caracteres'),
  address: z.string().min(5, 'Adresse requise'),
  city: z.string().min(2, 'Ville requise'),
  country: z.string().min(2, 'Pays requis'),
  phone: z.string().min(8, 'Numero de telephone invalide'),
  email: z.string().email('Email invalide').optional().or(z.literal('')),
  googleMapsLink: z.string().url('Lien Google Maps invalide').optional().or(z.literal('')),
  responsibleUserId: z.string().uuid('ID responsable invalide').optional(),
});

export const updateAgencySchema = createAgencySchema.partial();

export type CreateAgencyInput = z.infer<typeof createAgencySchema>;
export type UpdateAgencyInput = z.infer<typeof updateAgencySchema>;
