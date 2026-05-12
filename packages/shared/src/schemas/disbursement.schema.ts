import { z } from 'zod';

export const createDisbursementSchema = z.object({
  agencyId: z.string().uuid('ID agence invalide'),
  reason: z.string().min(3, 'Le motif doit contenir au moins 3 caracteres'),
  description: z.string().optional(),
  /** Nom snapshote de l'ordonnateur (immutable, conserve meme si l'employe est renomme/supprime). */
  orderer: z.string().min(2, "L'ordonnateur est requis"),
  /** Lien vers le User reel si l'ordonnateur est un employe interne. */
  ordererUserId: z.string().uuid().optional().nullable(),
  amount: z.number().positive('Le montant doit etre positif'),
  amountInWords: z.string().min(3, 'Le montant en lettres est requis'),
  /** URL du justificatif (image/PDF) uploade au prealable. */
  proofUrl: z.string().url().optional().nullable(),
  /** Cle MinIO correspondante pour permettre la suppression/remplacement. */
  proofKey: z.string().optional().nullable(),
  /** Commentaire libre sur le justificatif (facture, recu, devis...). */
  justificationDescription: z.string().optional().nullable(),
  /** Liens optionnels vers une entite metier (remboursement, imputation). */
  containerId: z.string().uuid().optional().nullable(),
  parcelId: z.string().uuid().optional().nullable(),
  clientId: z.string().uuid().optional().nullable(),
});

export const voidDisbursementSchema = z.object({
  reason: z.string().min(5, 'La raison doit contenir au moins 5 caracteres'),
});

export type CreateDisbursementInput = z.infer<typeof createDisbursementSchema>;
export type VoidDisbursementInput = z.infer<typeof voidDisbursementSchema>;
