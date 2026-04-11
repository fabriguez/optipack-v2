import { z } from 'zod';
import { TransitType } from '../constants/enums';

export const createContainerSchema = z.object({
  designation: z.string().min(2, 'La designation doit contenir au moins 2 caracteres'),
  type: z.enum([TransitType.AIR, TransitType.SEA, TransitType.LAND]),
  capacity: z.number().positive('La capacite doit etre positive'),
  departureAgencyId: z.string().uuid("ID agence de depart invalide"),
  arrivalAgencyId: z.string().uuid("ID agence d'arrivee invalide"),
  transitRouteId: z.string().uuid('ID route de transit invalide').optional(),
});

export const updateContainerSchema = createContainerSchema.partial();

export const loadParcelSchema = z.object({
  parcelId: z.string().uuid('ID colis invalide'),
});

export const loadParcelsSchema = z.object({
  parcelIds: z.array(z.string().uuid('ID colis invalide')).min(1, 'Au moins un colis requis'),
});

export type CreateContainerInput = z.infer<typeof createContainerSchema>;
export type UpdateContainerInput = z.infer<typeof updateContainerSchema>;
export type LoadParcelInput = z.infer<typeof loadParcelSchema>;
export type LoadParcelsInput = z.infer<typeof loadParcelsSchema>;
