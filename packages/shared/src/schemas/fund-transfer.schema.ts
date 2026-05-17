import { z } from 'zod';
import { TransferDestinationType } from '../constants/enums';

export const createFundTransferSchema = z
  .object({
    // Defaut AGENCY (back-compat). HQ pour un transfert initie depuis le siege.
    sourceType: z.enum(['AGENCY', 'HQ']).default('AGENCY'),
    sourceAgencyId: z.string().uuid('ID agence source invalide').optional(),
    sourceOrganizationId: z.string().uuid('ID organisation source invalide').optional(),
    destinationType: z.enum([
      TransferDestinationType.HQ,
      TransferDestinationType.BANK,
      TransferDestinationType.AGENCY,
    ]),
    destinationId: z.string().optional(),
    amount: z.number().positive('Le montant doit etre positif'),
    transferMethod: z.string().min(2, 'Le mode de transfert est requis'),
    sourcePaymentMethod: z.string().optional(),
    destinationPaymentMethod: z.string().optional(),
  })
  .refine(
    (d) => (d.sourceType === 'AGENCY' ? !!d.sourceAgencyId : !!d.sourceOrganizationId),
    { message: 'sourceAgencyId requis si sourceType=AGENCY, sourceOrganizationId requis si sourceType=HQ' },
  )
  .refine(
    (d) => !(d.sourceType === 'HQ' && d.destinationType === 'HQ'),
    { message: 'Transfert siege -> siege interdit' },
  );

export const listFundTransferFiltersSchema = z.object({
  reference: z.string().optional(),
  sourceAgencyId: z.string().uuid().optional(),
  sourceOrganizationId: z.string().uuid().optional(),
  sourceType: z.enum(['AGENCY', 'HQ']).optional(),
  destinationAgencyId: z.string().uuid().optional(),
  status: z.enum(['PENDING', 'CONFIRMED', 'VOIDED']).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  sourcePaymentMethod: z.string().optional(),
  destinationPaymentMethod: z.string().optional(),
  minAmount: z.coerce.number().nonnegative().optional(),
  maxAmount: z.coerce.number().nonnegative().optional(),
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
export type ListFundTransferFiltersInput = z.infer<typeof listFundTransferFiltersSchema>;
