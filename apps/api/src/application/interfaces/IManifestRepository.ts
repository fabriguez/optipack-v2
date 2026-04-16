import type { ShippingManifest, ManifestLine } from '@prisma/client';
import type { PaginationInput, PaginatedResponse } from '@optipack/shared';

export interface ManifestWithLines extends ShippingManifest {
  lines: ManifestLine[];
  container?: { id: string; designation: string; status: string };
}

export interface ManifestComparison {
  dispatch: ManifestLine[];
  reception: ManifestLine[];
  missing: string[];
  extra: string[];
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
}

export const MANIFEST_REPOSITORY = Symbol.for('IManifestRepository');
