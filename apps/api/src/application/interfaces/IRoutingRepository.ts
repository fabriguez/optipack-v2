import type { InterAgencyRouting } from '@prisma/client';

export interface RoutingWithRelations extends InterAgencyRouting {
  parcel?: { id: string; trackingNumber: string; designation: string; destination: string };
  sourceContainer?: { id: string; designation: string };
  targetContainer?: { id: string; designation: string } | null;
}

export interface CreateRoutingInput {
  parcelId: string;
  sourceAgencyId: string;
  targetAgencyId: string;
  targetCity: string;
}

export interface IRoutingRepository {
  findByContainer(containerId: string): Promise<RoutingWithRelations[]>;
  findByParcel(parcelId: string): Promise<RoutingWithRelations[]>;
  createRoutings(containerId: string, routings: CreateRoutingInput[]): Promise<InterAgencyRouting[]>;
  redistributeAfterUnload(containerId: string): Promise<RoutingWithRelations[]>;
}

export const ROUTING_REPOSITORY = Symbol.for('IRoutingRepository');
