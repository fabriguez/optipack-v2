import { z } from 'zod';

/**
 * Applique (ou supprime) une remise commerciale sur une facture avec
 * justification obligatoire. La justification est tracee dans AuditLog.
 */
export const applyInvoiceDiscountSchema = z.object({
  amount: z.number().min(0, 'La remise ne peut pas etre negative'),
  reason: z.string().min(3, 'Justification obligatoire (3 caracteres min)').max(1000),
});

export type ApplyInvoiceDiscountInput = z.infer<typeof applyInvoiceDiscountSchema>;
