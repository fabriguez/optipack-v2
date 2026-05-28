import { z } from 'zod';

// Types de dettes : determine quelle FK est obligatoire dans le create.
export const DebtTypeValues = ['CLIENT', 'EMPLOYEE', 'AGENCY', 'CARRIER'] as const;
export type DebtType = (typeof DebtTypeValues)[number];

export const DebtCategoryValues = [
  'FREIGHT', 'CUSTOMS', 'STORAGE', 'DELIVERY', 'TRANSIT', 'PENALTY', 'ADVANCE',
  'TRANSPORT', 'SUPPLY', 'PORT_FEES', 'FUEL', 'LABOR', 'TAXES', 'MAINTENANCE',
  'RENT', 'OTHER',
] as const;
export type DebtCategory = (typeof DebtCategoryValues)[number];

export const DebtPriorityValues = ['LOW', 'MEDIUM', 'CRITICAL'] as const;
export type DebtPriority = (typeof DebtPriorityValues)[number];

export const DebtStatusValues = [
  'ACTIVE',
  'PARTIALLY_PAID',
  'CLEARED',
  'OVERDUE',
  'LITIGATED',
  'CANCELLED',
] as const;
export type DebtStatus = (typeof DebtStatusValues)[number];

// Sous-echeance : pour les paiements echelonnes.
const subDueDateSchema = z.object({
  date: z.string().or(z.date()),
  amount: z.number().nonnegative(),
  paid: z.boolean().optional().default(false),
  label: z.string().optional(),
});

export const createDebtSchema = z
  .object({
    type: z.enum(DebtTypeValues),
    agencyId: z.string().uuid("ID agence invalide"),
    motif: z.string().min(3, 'Motif requis (min 3 caracteres)').max(200),
    description: z.string().max(2000).optional(),
    totalAmount: z.number().positive('Le montant doit etre positif'),
    // Identifiants typees : selon `type`, l'un d'eux est requis (validation
    // metier cote use case).
    clientId: z.string().uuid().optional(),
    employeeId: z.string().uuid().optional(),
    carrierId: z.string().uuid().optional(),
    parcelId: z.string().uuid().optional(),
    invoiceId: z.string().uuid().optional(),
    agencyChargeId: z.string().uuid().optional(),
    creditor: z.string().max(200).optional(),
    nextDueDate: z.string().or(z.date()).optional(),
    dueDateFinal: z.string().or(z.date()).optional(),
    subDueDates: z.array(subDueDateSchema).optional(),
    category: z.enum(DebtCategoryValues).optional(),
    priority: z.enum(DebtPriorityValues).optional(),
  })
  .refine(
    (data) => {
      switch (data.type) {
        case 'CLIENT':
          return !!data.clientId;
        case 'EMPLOYEE':
          return !!data.employeeId;
        case 'AGENCY':
          // AGENCY peut etre rattache a une charge recurrente OU a un
          // creancier libre. On exige au moins l'un des deux.
          return !!data.agencyChargeId || !!data.creditor;
        case 'CARRIER':
          return !!data.carrierId;
        default:
          return false;
      }
    },
    {
      message:
        "L'identifiant typee requis selon le type est manquant (clientId / employeeId / agencyChargeId|creditor / carrierId).",
      path: ['type'],
    },
  );

export const recordDebtPaymentSchema = z.object({
  amount: z.number().positive('Le montant doit etre positif'),
  paymentMethod: z.string().min(2, 'Methode de paiement requise').max(40),
  agencyId: z.string().uuid('Agence requise'),
  transactionReference: z.string().max(200).optional(),
  comment: z.string().max(1000).optional(),
  // URL du justificatif uploade au prealable (MinIO). Optionnel pour le cash
  // mais fortement recommande pour MoMo/Virement (preuve transaction).
  proofUrl: z.string().url().optional(),
  proofKey: z.string().optional(),
});

export const voidDebtSchema = z.object({
  reason: z.string().min(5, 'Raison requise (min 5 caracteres)').max(500),
});

export const voidDebtPaymentSchema = z.object({
  reason: z.string().min(5, 'Raison requise (min 5 caracteres)').max(500),
});

// Ajustement du montant d'une dette : reserve admin. Le delta est trace dans
// DebtHistory. On exige un motif pour audit.
export const adjustDebtSchema = z.object({
  newTotalAmount: z.number().nonnegative('Le nouveau montant doit etre >= 0'),
  reason: z.string().min(5, 'Motif requis').max(500),
  newDueDateFinal: z.string().or(z.date()).optional(),
  newNextDueDate: z.string().or(z.date()).optional(),
});

export const markDebtLitigatedSchema = z.object({
  reason: z.string().min(5, 'Motif requis').max(500),
});

// Schemas Carrier (transporteur) -- modele cree dans la meme refonte.
export const createCarrierSchema = z.object({
  name: z.string().min(2, 'Nom requis').max(200),
  contactName: z.string().max(200).optional(),
  phone: z.string().max(50).optional(),
  email: z.string().email('Email invalide').optional().or(z.literal('')),
  address: z.string().max(500).optional(),
  carrierType: z.string().max(100).optional(),
  notes: z.string().max(2000).optional(),
  emergencyContactName: z.string().max(120).optional(),
  emergencyContactPhone: z.string().max(40).optional(),
  emergencyContactRelation: z.string().max(60).optional(),
});

export const updateCarrierSchema = createCarrierSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export type CreateDebtInput = z.infer<typeof createDebtSchema>;
export type RecordDebtPaymentInput = z.infer<typeof recordDebtPaymentSchema>;
export type VoidDebtInput = z.infer<typeof voidDebtSchema>;
export type VoidDebtPaymentInput = z.infer<typeof voidDebtPaymentSchema>;
export type AdjustDebtInput = z.infer<typeof adjustDebtSchema>;
export type MarkDebtLitigatedInput = z.infer<typeof markDebtLitigatedSchema>;
export type CreateCarrierInput = z.infer<typeof createCarrierSchema>;
export type UpdateCarrierInput = z.infer<typeof updateCarrierSchema>;
