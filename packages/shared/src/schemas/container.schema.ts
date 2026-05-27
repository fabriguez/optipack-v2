import { z } from 'zod';
import { TransitType } from '../constants/enums';

export const createContainerSchema = z.object({
  // Designation optionnelle : si omise (ou vide), le backend genere une
  // designation auto de la forme <ORG>-<TYPE>-<DEST>-<NUM> via
  // CreateContainerUseCase / buildAutoDesignation. Permet d'eviter les
  // collisions et les noms non normalises saisis a la main.
  designation: z.string().trim().min(2, 'La designation doit contenir au moins 2 caracteres').optional().or(z.literal('')),
  type: z.enum([TransitType.AIR, TransitType.SEA, TransitType.LAND]),
  isForwarding: z.boolean().optional().default(false),
  parentContainerId: z.string().uuid('ID conteneur parent invalide').optional(),
  carrier: z.string().trim().min(1).max(120).optional(),
  // Nouveau : transporteur structure (FK) + cout. Le cout > 0 cree automatiquement
  // une depense de transport imputee au conteneur (propagee aux parents si
  // forwarding au depart).
  carrierId: z.string().uuid('ID transporteur invalide').optional(),
  carrierCost: z.number().nonnegative('Le cout transporteur doit etre positif ou nul').optional(),
  capacity: z.number().positive('La capacite doit etre positive'),
  departureAgencyId: z.string().uuid("ID agence de depart invalide"),
  arrivalAgencyId: z.string().uuid("ID agence d'arrivee invalide"),
  transitRouteId: z.string().uuid('ID route de transit invalide').optional(),
}).refine(
  (data) => !data.parentContainerId || data.isForwarding === true,
  {
    message: "Seul un conteneur d'acheminement peut avoir un conteneur parent",
    path: ['parentContainerId'],
  },
);

export const updateContainerSchema = z.object({
  designation: z.string().min(2).optional(),
  type: z.enum([TransitType.AIR, TransitType.SEA, TransitType.LAND]).optional(),
  isForwarding: z.boolean().optional(),
  parentContainerId: z.string().uuid().nullable().optional(),
  carrier: z.string().trim().min(1).max(120).nullable().optional(),
  carrierId: z.string().uuid().nullable().optional(),
  carrierCost: z.number().nonnegative().optional(),
  capacity: z.number().positive().optional(),
  departureAgencyId: z.string().uuid().optional(),
  arrivalAgencyId: z.string().uuid().optional(),
  transitRouteId: z.string().uuid().optional(),
});

export const loadParcelSchema = z.object({
  parcelId: z.string().uuid('ID colis invalide'),
});

export const loadParcelsSchema = z.object({
  parcelIds: z.array(z.string().uuid('ID colis invalide')).min(1, 'Au moins un colis requis'),
});

export const loadByQrSchema = z.object({
  trackingNumber: z.string().min(1, 'Numero de tracking requis'),
});

export const removeParcelFromContainerSchema = z.object({
  parcelId: z.string().uuid('ID colis invalide'),
  reason: z.string().min(2, 'Une raison est requise').max(500),
});

export type CreateContainerInput = z.infer<typeof createContainerSchema>;
export type UpdateContainerInput = z.infer<typeof updateContainerSchema>;
export type LoadParcelInput = z.infer<typeof loadParcelSchema>;
export type LoadParcelsInput = z.infer<typeof loadParcelsSchema>;
export type LoadByQrInput = z.infer<typeof loadByQrSchema>;
export type RemoveParcelFromContainerInput = z.infer<typeof removeParcelFromContainerSchema>;
