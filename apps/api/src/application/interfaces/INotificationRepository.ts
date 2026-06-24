import type { Notification, Prisma } from '@prisma/client';
import type { PaginationInput, PaginatedResponse } from '@transitsoftservices/shared';

export interface NotificationWithRelations extends Notification {
  agency?: { id: string; name: string } | null;
  client?: { id: string; fullName: string; phone: string } | null;
}

/**
 * Filtres du centre de notifications (vue admin tenant-scopee). Les champs
 * CSV (type/status/eventKind) acceptent une valeur unique ou plusieurs separees
 * par des virgules.
 */
export interface AdminNotificationFilters {
  organizationId: string;
  type?: string;
  status?: string;
  clientId?: string;
  eventKind?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface AdminNotificationStats {
  total: number;
  byStatus: Record<string, number>;
  byChannel: Record<string, number>;
}

export interface INotificationRepository {
  findById(id: string): Promise<NotificationWithRelations | null>;
  findByUser(userId: string, pagination: PaginationInput): Promise<PaginatedResponse<NotificationWithRelations>>;
  findByClient(clientId: string, pagination: PaginationInput): Promise<PaginatedResponse<NotificationWithRelations>>;
  findAll(
    filters: { agencyIds?: string[]; userId?: string; clientId?: string; status?: string },
    pagination: PaginationInput,
  ): Promise<PaginatedResponse<NotificationWithRelations>>;
  /** Liste tenant-scopee pour le centre de notifications (admin). */
  findAllAdmin(
    filters: AdminNotificationFilters,
    pagination: PaginationInput,
  ): Promise<PaginatedResponse<NotificationWithRelations>>;
  /** Agregats (file d'attente) pour le centre de notifications. */
  adminStats(filters: AdminNotificationFilters): Promise<AdminNotificationStats>;
  create(data: Prisma.NotificationUncheckedCreateInput): Promise<Notification>;
  markAsRead(id: string): Promise<Notification>;
  markAllAsRead(userId: string): Promise<number>;
  countUnread(userId: string): Promise<number>;
}

export const NOTIFICATION_REPOSITORY = Symbol.for('INotificationRepository');
