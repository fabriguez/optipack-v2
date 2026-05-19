import { z } from 'zod';

export const ParcelCategoryValues = [
  'STANDARD',
  'DOCUMENT',
  'FOOD',
  'ELECTRONICS',
  'CLOTHING',
  'OTHER',
] as const;
export type ParcelCategory = (typeof ParcelCategoryValues)[number];

// Preprocess pour les champs numeriques RHF avec valueAsNumber : un input
// vide produit NaN qui fait crasher z.number(). On mappe NaN/null/'' vers
// undefined pour laisser .optional() le tolerer.
const numNullish = (inner: z.ZodTypeAny) =>
  z.preprocess(
    (v) => (v === '' || v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v)) ? undefined : v),
    inner,
  );

const baseParcelFields = {
  designation: z.string().min(2, 'La designation doit contenir au moins 2 caracteres'),
  // Tracking interne fournisseur (code colis externe, ex: AliExpress, DHL).
  // Optionnel, pas d'unicite stricte au niveau DB.
  trackingFournisseur: z.string().min(1).optional().or(z.literal('')),
  weight: numNullish(z.number().positive('La masse doit etre positive').optional()),
  volume: numNullish(z.number().positive('Le volume doit etre positif').optional()),
  // Destination structuree :
  // - destinationAgencyId : agence d'arrivee (obligatoire). Le champ "destination"
  //   (ville) est derive automatiquement cote backend depuis agency.city.
  // - destinationAddress : complement d'adresse libre (rue, quartier).
  destinationAgencyId: z.string().uuid("Selectionnez l'agence de destination"),
  // Adresse precise : totalement optionnelle (peut etre vide, null, undefined,
  // ou absente du payload). Aucune contrainte de longueur. La transformation
  // en null se fait cote use case backend.
  destinationAddress: z.string().nullish().or(z.literal('')),
  category: z.enum(ParcelCategoryValues).optional().default('STANDARD'),
  isFragile: z.boolean().optional().default(false),
  isHazardous: z.boolean().optional().default(false),
  declaredValue: numNullish(z.number().nonnegative().optional().nullable()),
  observation: z.string().optional().or(z.literal('')),
  clientId: z.string().uuid('ID client invalide'),
  recipientId: z.string().uuid('ID destinataire invalide').optional(),
  warehouseId: z.string().uuid('ID magasin invalide'),
  transitRouteId: z.string().uuid('ID route de transit invalide'),
};

export const createParcelSchema = z
  .object(baseParcelFields)
  .refine(
    (data) => (data.weight != null && data.weight > 0) || (data.volume != null && data.volume > 0),
    { message: 'Le colis doit avoir une masse ou un volume', path: ['weight'] },
  );

// Audit fix #5 : creation batch (1 facture pour N colis)
export const createBatchParcelsSchema = z.object({
  clientId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  transitRouteId: z.string().uuid(),
  recipientId: z.string().uuid().optional(),
  parcels: z
    .array(
      z.object({
        designation: z.string().min(2),
        trackingFournisseur: z.string().min(1).optional(),
        weight: z.number().positive().optional(),
        volume: z.number().positive().optional(),
        destinationAgencyId: z.string().uuid(),
        destinationAddress: z.string().nullish(),
        category: z.enum(ParcelCategoryValues).optional().default('STANDARD'),
        isFragile: z.boolean().optional().default(false),
        isHazardous: z.boolean().optional().default(false),
        declaredValue: z.number().nonnegative().optional().nullable(),
        observation: z.string().optional(),
      }),
    )
    .min(1, 'Au moins 1 colis requis'),
});

export const updateParcelSchema = z.object({
  designation: z.string().min(2).optional(),
  trackingFournisseur: z.string().nullable().optional(),
  weight: numNullish(z.number().positive().nullable().optional()),
  volume: numNullish(z.number().positive().nullable().optional()),
  destinationAgencyId: z.string().uuid().optional(),
  destinationAddress: z.string().optional().nullable(),
  category: z.enum(ParcelCategoryValues).optional(),
  isFragile: z.boolean().optional(),
  isHazardous: z.boolean().optional(),
  declaredValue: z.number().nonnegative().optional().nullable(),
  observation: z.string().nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  recipientId: z.string().uuid().optional().nullable(),
  warehouseId: z.string().uuid().optional().nullable(),
  transitRouteId: z.string().uuid().optional(),
});

export type CreateParcelInput = z.infer<typeof createParcelSchema>;
export type CreateBatchParcelsInput = z.infer<typeof createBatchParcelsSchema>;
export type UpdateParcelInput = z.infer<typeof updateParcelSchema>;
