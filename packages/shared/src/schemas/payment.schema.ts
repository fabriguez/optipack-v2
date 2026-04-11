import { z } from 'zod';
import { PaymentMethod } from '../constants/enums';

export const recordPaymentSchema = z.object({
  invoiceId: z.string().uuid('ID facture invalide'),
  agencyId: z.string().uuid("ID agence d'encaissement invalide"),
  amount: z.number().positive('Le montant doit etre positif'),
  paymentMethod: z.enum([
    PaymentMethod.CASH,
    PaymentMethod.MOBILE_MONEY,
    PaymentMethod.BANK_TRANSFER,
    PaymentMethod.CARD,
    PaymentMethod.CHECK,
  ]),
  discount: z.number().min(0, 'La remise ne peut pas etre negative').optional(),
  discountReason: z.string().optional(),
  tva: z.number().min(0).optional(),
  transactionReference: z.string().optional(),
});

export const voidPaymentSchema = z.object({
  reason: z.string().min(5, 'La raison doit contenir au moins 5 caracteres'),
});

export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
export type VoidPaymentInput = z.infer<typeof voidPaymentSchema>;
