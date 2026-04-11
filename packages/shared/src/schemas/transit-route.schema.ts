import { z } from 'zod';
import { TransitType } from '../constants/enums';

export const createTransitRouteSchema = z.object({
  name: z.string().min(2, 'Le nom doit contenir au moins 2 caracteres'),
  type: z.enum([TransitType.AIR, TransitType.SEA, TransitType.LAND]),
  departureCity: z.string().min(2, 'Ville de depart requise'),
  departureCountry: z.string().min(2, 'Pays de depart requis'),
  arrivalCity: z.string().min(2, "Ville d'arrivee requise"),
  arrivalCountry: z.string().min(2, "Pays d'arrivee requis"),
  pricePerKg: z.number().positive('Le prix par kg doit etre positif'),
  pricePerVolume: z.number().min(0, 'Le prix par volume ne peut pas etre negatif').optional().default(0),
  estimatedDurationDays: z.number().int().min(0).optional().default(0),
});

export const updateTransitRouteSchema = createTransitRouteSchema.partial();

export type CreateTransitRouteInput = z.infer<typeof createTransitRouteSchema>;
export type UpdateTransitRouteInput = z.infer<typeof updateTransitRouteSchema>;
