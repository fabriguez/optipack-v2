import { z } from 'zod';

export const createDisbursementSchema = z.object({
  agencyId: z.string().uuid('ID agence invalide'),
  reason: z.string().min(3, 'Le motif doit contenir au moins 3 caracteres'),
  description: z.string().optional(),
  orderer: z.string().min(2, "L'ordonnateur est requis"),
  amount: z.number().positive('Le montant doit etre positif'),
  amountInWords: z.string().min(3, 'Le montant en lettres est requis'),
});

export const voidDisbursementSchema = z.object({
  reason: z.string().min(5, 'La raison doit contenir au moins 5 caracteres'),
});

export type CreateDisbursementInput = z.infer<typeof createDisbursementSchema>;
export type VoidDisbursementInput = z.infer<typeof voidDisbursementSchema>;
