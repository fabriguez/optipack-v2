import type { Notification, Prisma } from '@prisma/client';
import type { PaginationInput, PaginatedResponse } from '@transitsoftservices/shared';

export interface NotificationWithRelations extends Notification {
  agency?: { id: string; name: string } | null;
  client?: { id: string; fullName: string; phone: string } | null;
}

export interface INotificationRepository {
  findById(id: string): Promise<NotificationWithRelations | null>;
  findByUser(userId: string, pagination: PaginationInput): Promise<PaginatedResponse<NotificationWithRelations>>;
  findByClient(clientId: string, pagination: PaginationInput): Promise<PaginatedResponse<NotificationWithRelations>>;
  findAll(
    filters: { agencyIds?: string[]; userId?: string; clientId?: string; status?: string },
    pagination: PaginationInput,
  ): Promise<PaginatedResponse<NotificationWithRelations>>;
  create(data: Prisma.NotificationUncheckedCreateInput): Promise<Notification>;
  markAsRead(id: string): Promise<Notification>;
  markAllAsRead(userId: string): Promise<number>;
  countUnread(userId: string): Promise<number>;
}

export const NOTIFICATION_REPOSITORY = Symbol.for('INotificationRepository');
