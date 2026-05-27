import { z } from 'zod';

// Une piece jointe deja uploadee (l'upload reel se fait depuis le client
// via /uploads/file ; on persiste juste les coordonnees retournees).
const paymentAttachmentSchema = z.object({
  url: z.string().min(1),
  key: z.string().min(1),
  // Determine si la piece est une photo (capture caisse), un PDF (recu MoMo,
  // virement, ordre de paiement) ou autre type (Word, screenshot...).
  kind: z.enum(['IMAGE', 'PDF', 'OTHER']).default('OTHER'),
  caption: z.string().max(500).optional(),
});

export const recordPaymentSchema = z.object({
  invoiceId: z.string().uuid('ID facture invalide'),
  agencyId: z.string().uuid("ID agence d'encaissement invalide"),
  // Scope optionnel sur un colis precis (facture multi-colis ou client paie
  // un seul colis a la fois).
  parcelId: z.string().uuid().optional(),
  amount: z.number().positive('Le montant doit etre positif'),
  // String libre : reference PaymentMethodConfig.code (peut etre custom).
  // Validation cote backend : doit exister dans PaymentMethodConfig actif.
  paymentMethod: z.string().min(2, 'Methode de paiement requise').max(40),
  discount: z.number().min(0, 'La remise ne peut pas etre negative').optional(),
  discountReason: z.string().optional(),
  tva: z.number().min(0).optional(),
  transactionReference: z.string().optional(),
  // 0..N justificatifs (image / PDF / autre). Capture multiple cote UI.
  attachments: z.array(paymentAttachmentSchema).optional(),
});

export const voidPaymentSchema = z.object({
  reason: z.string().min(5, 'La raison doit contenir au moins 5 caracteres'),
});

export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
export type VoidPaymentInput = z.infer<typeof voidPaymentSchema>;
