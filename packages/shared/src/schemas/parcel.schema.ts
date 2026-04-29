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

const baseParcelFields = {
  designation: z.string().min(2, 'La designation doit contenir au moins 2 caracteres'),
  weight: z.number().positive('La masse doit etre positive').optional(),
  volume: z.number().positive('Le volume doit etre positif').optional(),
  // Destination structuree (audit fix #1)
  destination: z.string().min(2, 'La destination est requise'),
  destinationAgencyId: z.string().uuid().optional().nullable(),
  destinationAddress: z.string().optional().or(z.literal('')),
  // Categorie + flags (audit fix #10)
  category: z.enum(ParcelCategoryValues).optional().default('STANDARD'),
  isFragile: z.boolean().optional().default(false),
  isHazardous: z.boolean().optional().default(false),
  declaredValue: z.number().nonnegative().optional().nullable(),
  observation: z.string().optional().or(z.literal('')),
  clientId: z.string().uuid('ID client invalide'),
  recipientId: z.string().uuid('ID destinataire invalide').optional(),
  warehouseId: z.string().uuid('ID magasin invalide'),
  transitRouteId: z.string().uuid('ID route de transit invalide'),
};

export const createParcelSchema = z
  .object(baseParcelFields)
  .refine(
    (data) => (data.weight !== undefined && data.weight > 0) || (data.volume !== undefined && data.volume > 0),
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
        weight: z.number().positive().optional(),
        volume: z.number().positive().optional(),
        destination: z.string().min(2),
        destinationAgencyId: z.string().uuid().optional().nullable(),
        destinationAddress: z.string().optional(),
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
  weight: z.number().positive().nullable().optional(),
  volume: z.number().positive().nullable().optional(),
  destination: z.string().min(2).optional(),
  destinationAgencyId: z.string().uuid().optional().nullable(),
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
