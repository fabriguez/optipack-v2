import { z } from 'zod';
import { TransferDestinationType } from '../constants/enums';

export const createFundTransferSchema = z.object({
  sourceAgencyId: z.string().uuid('ID agence source invalide'),
  destinationType: z.enum([
    TransferDestinationType.HQ,
    TransferDestinationType.BANK,
    TransferDestinationType.AGENCY,
  ]),
  destinationId: z.string().optional(),
  amount: z.number().positive('Le montant doit etre positif'),
  transferMethod: z.string().min(2, 'Le mode de transfert est requis'),
});

export const confirmFundTransferSchema = z.object({
  confirmedByUserId: z.string().uuid('ID utilisateur invalide'),
});

export const voidFundTransferSchema = z.object({
  reason: z.string().min(5, 'La raison doit contenir au moins 5 caracteres'),
});

export type CreateFundTransferInput = z.infer<typeof createFundTransferSchema>;
export type ConfirmFundTransferInput = z.infer<typeof confirmFundTransferSchema>;
export type VoidFundTransferInput = z.infer<typeof voidFundTransferSchema>;
