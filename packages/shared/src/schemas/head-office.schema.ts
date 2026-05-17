import { z } from 'zod';

export const createHeadOfficeDisbursementSchema = z.object({
  organizationId: z.string().uuid('ID organisation invalide'),
  reason: z.string().min(3, 'Le motif doit contenir au moins 3 caracteres'),
  description: z.string().optional(),
  orderer: z.string().min(2, "L'ordonnateur est requis"),
  ordererUserId: z.string().uuid().optional().nullable(),
  amount: z.number().positive('Le montant doit etre positif'),
  amountInWords: z.string().min(3, 'Le montant en lettres est requis'),
  proofUrl: z.string().url().optional().nullable(),
  proofKey: z.string().optional().nullable(),
  justificationDescription: z.string().optional().nullable(),
  containerId: z.string().uuid().optional().nullable(),
  parcelId: z.string().uuid().optional().nullable(),
  clientId: z.string().uuid().optional().nullable(),
});

export const voidHeadOfficeDisbursementSchema = z.object({
  reason: z.string().min(5, 'La raison doit contenir au moins 5 caracteres'),
});

export const payEmployeeFromHeadOfficeSchema = z.object({
  organizationId: z.string().uuid('ID organisation invalide'),
  period: z.string().regex(/^\d{4}-\d{2}$/, 'Periode format YYYY-MM').optional(),
  amount: z.number().positive().optional(),
  installmentAmount: z.number().positive().optional(),
  description: z.string().optional(),
  note: z.string().optional(),
  applyDeductionIds: z.array(z.string().uuid()).optional(),
});

export type CreateHeadOfficeDisbursementInput = z.infer<typeof createHeadOfficeDisbursementSchema>;
export type VoidHeadOfficeDisbursementInput = z.infer<typeof voidHeadOfficeDisbursementSchema>;
export type PayEmployeeFromHeadOfficeInput = z.infer<typeof payEmployeeFromHeadOfficeSchema>;
