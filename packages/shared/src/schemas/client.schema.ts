import { z } from 'zod';
import { LoyaltyTier } from '../constants/enums';

export const ClientType = {
  INDIVIDUAL: 'INDIVIDUAL',
  COMPANY: 'COMPANY',
  PARTNER: 'PARTNER',
} as const;
export type ClientType = (typeof ClientType)[keyof typeof ClientType];

// Base (sans contrainte croisee) : sert a deriver createClientSchema (avec
// refine) et updateClientSchema (partial). `.partial()` n'existe que sur un
// ZodObject, donc la base ne doit PAS porter le `.refine()`.
const clientBaseSchema = z.object({
  fullName: z.string().min(2, 'Le nom doit contenir au moins 2 caracteres'),
  // Telephone et email sont tous deux OPTIONNELS individuellement ; la regle
  // "au moins un des deux" est appliquee par le refine ci-dessous.
  phone: z.string().min(8, 'Numero de telephone invalide').optional().or(z.literal('')),
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
  // Contact d'urgence (optionnel). Trois champs libres.
  emergencyContactName: z.string().trim().max(120).optional().or(z.literal('')),
  emergencyContactPhone: z.string().trim().max(40).optional().or(z.literal('')),
  emergencyContactRelation: z.string().trim().max(60).optional().or(z.literal('')),
});

// Au moins un identifiant de contact (telephone OU email) requis a la creation.
const hasPhoneOrEmail = (d: { phone?: string; email?: string }): boolean =>
  !!d.phone?.trim() || !!d.email?.trim();

export const createClientSchema = clientBaseSchema.refine(hasPhoneOrEmail, {
  message: 'Renseignez au moins un telephone ou un email',
  path: ['phone'],
});

// Update : champs optionnels (patch partiel). La contrainte "au moins un" n'est
// pas rejouee ici : un patch qui ne touche ni phone ni email est valide.
export const updateClientSchema = clientBaseSchema.partial();

// Tarification partenaire : la route est desormais OBLIGATOIRE a la creation.
// Son `type` (AIR/SEA/LAND) determine le champ requis (kg / m3). La coherence
// kg-vs-m3 ne peut pas etre verifiee ici (le type n'est pas dans le payload) :
// elle est appliquee cote controller via checkPricingForType() apres lookup de
// la route. Le schema ne valide que la forme.
export const partnerPricingSchema = z.object({
  transitRouteId: z.string().uuid('Selectionnez une route de transit'),
  pricePerKg: z.number().nonnegative('Prix par kg doit etre >= 0').nullable().optional(),
  pricePerVolume: z.number().nonnegative('Prix par volume doit etre >= 0').nullable().optional(),
  isActive: z.boolean().optional().default(true),
});

// Update : tous les prix optionnels (la route n'est pas modifiable).
export const updatePartnerPricingSchema = z.object({
  pricePerKg: z.number().nonnegative('Prix par kg doit etre >= 0').nullable().optional(),
  pricePerVolume: z.number().nonnegative('Prix par volume doit etre >= 0').nullable().optional(),
  isActive: z.boolean().optional(),
});

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
export type PartnerPricingInput = z.infer<typeof partnerPricingSchema>;
export type UpdatePartnerPricingInput = z.infer<typeof updatePartnerPricingSchema>;
