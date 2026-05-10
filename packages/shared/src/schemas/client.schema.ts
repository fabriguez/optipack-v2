import { z } from 'zod';
import { LoyaltyTier } from '../constants/enums';

export const ClientType = {
  INDIVIDUAL: 'INDIVIDUAL',
  COMPANY: 'COMPANY',
  PARTNER: 'PARTNER',
} as const;
export type ClientType = (typeof ClientType)[keyof typeof ClientType];

export const createClientSchema = z.object({
  fullName: z.string().min(2, 'Le nom doit contenir au moins 2 caracteres'),
  phone: z.string().min(8, 'Numero de telephone invalide'),
  email: z.string().email('Email invalide').optional().or(z.literal('')),
  address: z.string().optional().or(z.literal('')),
  // Agence d'enregistrement optionnelle. Un client appartient a l'organisation,
  // pas a une agence : ce champ trace juste qui l'a cree.
  agencyId: z.string().uuid('ID agence invalide').optional().nullable(),
  clientType: z
    .enum([ClientType.INDIVIDUAL, ClientType.COMPANY, ClientType.PARTNER])
    .optional()
    .default(ClientType.INDIVIDUAL),
  loyaltyTier: z
    .enum([LoyaltyTier.STANDARD, LoyaltyTier.SILVER, LoyaltyTier.GOLD, LoyaltyTier.VIP])
    .optional()
    .default(LoyaltyTier.STANDARD),
  isActive: z.boolean().optional().default(true),
});

export const updateClientSchema = createClientSchema.partial();

export const partnerPricingSchema = z.object({
  transitRouteId: z.string().uuid().nullable().optional(),
  pricePerKg: z.number().nonnegative('Prix par kg doit etre >= 0'),
  pricePerVolume: z.number().nonnegative('Prix par volume doit etre >= 0').optional().default(0),
  isActive: z.boolean().optional().default(true),
});

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
export type PartnerPricingInput = z.infer<typeof partnerPricingSchema>;
