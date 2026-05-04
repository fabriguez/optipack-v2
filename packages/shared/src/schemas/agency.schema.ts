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

export const CHARGE_TYPES = [
  'WATER',
  'ELECTRICITY',
  'RENT',
  'SALARY',
  'INTERNET',
  'PHONE',
  'CLEANING',
  'SECURITY',
  'MAINTENANCE',
  'OTHER',
] as const;

export const createAgencyChargeSchema = z.object({
  type: z.enum(CHARGE_TYPES),
  label: z.string().min(2, 'Libelle requis').max(120),
  defaultAmount: z.number().nonnegative('Montant doit etre positif ou nul'),
  dueDayOfMonth: z.number().int().min(1).max(31).optional(),
  reference: z.string().max(200).optional(),
});

export const updateAgencyChargeSchema = createAgencyChargeSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const payAgencyChargeSchema = z.object({
  amount: z.number().positive('Le montant doit etre positif'),
  // Periode au format YYYY-MM. Si omise, periode = mois courant.
  period: z.string().regex(/^\d{4}-\d{2}$/, 'Periode au format YYYY-MM').optional(),
  description: z.string().max(500).optional(),
  receiptUrl: z.string().url().optional().or(z.literal('')),
  justificationUrl: z.string().url().optional().or(z.literal('')),
});

export type CreateAgencyInput = z.infer<typeof createAgencySchema>;
export type UpdateAgencyInput = z.infer<typeof updateAgencySchema>;
export type CreateAgencyChargeInput = z.infer<typeof createAgencyChargeSchema>;
export type UpdateAgencyChargeInput = z.infer<typeof updateAgencyChargeSchema>;
export type PayAgencyChargeInput = z.infer<typeof payAgencyChargeSchema>;
export type ChargeType = (typeof CHARGE_TYPES)[number];
