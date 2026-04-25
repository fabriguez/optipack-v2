import type { ShippingManifest, ManifestLine, ManifestDiscrepancy } from '@prisma/client';
import type { PaginationInput, PaginatedResponse } from '@transitsoftservices/shared';

export interface ManifestWithLines extends ShippingManifest {
  lines: ManifestLine[];
  container?: { id: string; designation: string; status: string };
}

export interface ManifestComparison {
  dispatch: ManifestLine[];
  reception: ManifestLine[];
  missingParcelIds: string[];
  extraParcelIds: string[];
  // Ecarts marques par l'admin (colis presents physiquement non enregistres,
  // ou en ligne mais absents physiquement)
  discrepancies: ManifestDiscrepancy[];
}

export interface DiscrepancyInput {
  containerId: string;
  parcelId?: string | null;
  type: 'MISSING_PHYSICAL' | 'EXTRA_PHYSICAL';
  designation?: string | null;
  trackingNumber?: string | null;
  weight?: number | null;
  comment?: string | null;
  markedByUserId?: string | null;
}

export interface IManifestRepository {
  findById(id: string): Promise<ManifestWithLines | null>;
  findByContainer(containerId: string): Promise<ManifestWithLines[]>;
  findAll(
    filters: { containerId?: string; type?: string; status?: string },
    pagination: PaginationInput,
  ): Promise<PaginatedResponse<ManifestWithLines>>;
  createDispatchManifest(containerId: string, userId: string): Promise<ManifestWithLines>;
  createReceptionManifest(containerId: string, userId: string): Promise<ManifestWithLines>;
  getComparison(containerId: string): Promise<ManifestComparison>;
  addDiscrepancy(input: DiscrepancyInput): Promise<ManifestDiscrepancy>;
  removeDiscrepancy(id: string): Promise<void>;
  listDiscrepancies(containerId: string): Promise<ManifestDiscrepancy[]>;
}

export const MANIFEST_REPOSITORY = Symbol.for('IManifestRepository');
