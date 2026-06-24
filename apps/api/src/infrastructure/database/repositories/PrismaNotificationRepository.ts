import { injectable } from 'tsyringe';
import type { Notification, Prisma } from '@prisma/client';
import type {
  AdminNotificationFilters,
  AdminNotificationStats,
  INotificationRepository,
  NotificationWithRelations,
} from '../../../application/interfaces/INotificationRepository';
import type { PaginationInput, PaginatedResponse } from '@transitsoftservices/shared';
import { prisma } from '../../../config/database';

const NOTIFICATION_INCLUDE = {
  agency: { select: { id: true, name: true } },
  client: { select: { id: true, fullName: true, phone: true } },
};

/** "AIR,LAND" -> { in: [...] } ; "AIR" -> "AIR" ; vide -> undefined. */
function csvFilter(value?: string): any {
  if (!value) return undefined;
  const parts = value.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return undefined;
  return parts.length === 1 ? parts[0] : { in: parts };
}

/** Construit le WHERE Prisma commun a la liste + aux stats du centre de notifs. */
function buildAdminWhere(f: AdminNotificationFilters): import('@prisma/client').Prisma.NotificationWhereInput {
  const createdAt: { gte?: Date; lte?: Date } = {};
  if (f.dateFrom) createdAt.gte = new Date(f.dateFrom);
  if (f.dateTo) {
    // dateTo inclusif : fin de journee.
    const to = new Date(f.dateTo);
    to.setHours(23, 59, 59, 999);
    createdAt.lte = to;
  }
  return {
    organizationId: f.organizationId,
    ...(csvFilter(f.type) && { type: csvFilter(f.type) }),
    ...(csvFilter(f.status) && { status: csvFilter(f.status) }),
    ...(csvFilter(f.eventKind) && { eventKind: csvFilter(f.eventKind) }),
    ...(f.clientId && { clientId: f.clientId }),
    ...((createdAt.gte || createdAt.lte) && { createdAt }),
  };
}

@injectable()
export class PrismaNotificationRepository implements INotificationRepository {
  async findById(id: string): Promise<NotificationWithRelations | null> {
    return prisma.notification.findUnique({
      where: { id },
      include: NOTIFICATION_INCLUDE,
    }) as Promise<NotificationWithRelations | null>;
  }

  async findByUser(
    userId: string,
    pagination: PaginationInput,
  ): Promise<PaginatedResponse<NotificationWithRelations>> {
    const { page, limit, sortBy, sortOrder } = pagination;
    const skip = (page - 1) * limit;

    const where: Prisma.NotificationWhereInput = { userId };

    const [data, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        skip,
        take: limit,
        orderBy: sortBy ? { [sortBy]: sortOrder } : { createdAt: 'desc' },
        include: NOTIFICATION_INCLUDE,
      }),
      prisma.notification.count({ where }),
    ]);

    return {
      data: data as NotificationWithRelations[],
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findByClient(
    clientId: string,
    pagination: PaginationInput,
  ): Promise<PaginatedResponse<NotificationWithRelations>> {
    const { page, limit, sortBy, sortOrder } = pagination;
    const skip = (page - 1) * limit;

    const where: Prisma.NotificationWhereInput = { clientId };

    const [data, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        skip,
        take: limit,
        orderBy: sortBy ? { [sortBy]: sortOrder } : { createdAt: 'desc' },
        include: NOTIFICATION_INCLUDE,
      }),
      prisma.notification.count({ where }),
    ]);

    return {
      data: data as NotificationWithRelations[],
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findAll(
    filters: { agencyIds?: string[]; userId?: string; clientId?: string; status?: string },
    pagination: PaginationInput,
  ): Promise<PaginatedResponse<NotificationWithRelations>> {
    const { page, limit, sortBy, sortOrder, search } = pagination;
    const skip = (page - 1) * limit;

    const where: Prisma.NotificationWhereInput = {
      ...(filters.userId && { userId: filters.userId }),
      ...(filters.clientId && { clientId: filters.clientId }),
      ...(filters.status && { status: filters.status as any }),
      ...(filters.agencyIds?.length && {
        agencyId: { in: filters.agencyIds },
      }),
      ...(search && {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { message: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        skip,
        take: limit,
        orderBy: sortBy ? { [sortBy]: sortOrder } : { createdAt: 'desc' },
        include: NOTIFICATION_INCLUDE,
      }),
      prisma.notification.count({ where }),
    ]);

    return {
      data: data as NotificationWithRelations[],
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findAllAdmin(
    filters: AdminNotificationFilters,
    pagination: PaginationInput,
  ): Promise<PaginatedResponse<NotificationWithRelations>> {
    const { page, limit, sortBy, sortOrder, search } = pagination;
    const skip = (page - 1) * limit;

    const where: Prisma.NotificationWhereInput = {
      ...buildAdminWhere(filters),
      ...(search && {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { message: { contains: search, mode: 'insensitive' } },
          { recipient: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        skip,
        take: limit,
        orderBy: sortBy ? { [sortBy]: sortOrder } : { createdAt: 'desc' },
        include: NOTIFICATION_INCLUDE,
      }),
      prisma.notification.count({ where }),
    ]);

    return {
      data: data as NotificationWithRelations[],
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async adminStats(filters: AdminNotificationFilters): Promise<AdminNotificationStats> {
    const where = buildAdminWhere(filters);
    const [byStatusRaw, byChannelRaw, total] = await Promise.all([
      prisma.notification.groupBy({ by: ['status'], where, _count: { _all: true } }),
      prisma.notification.groupBy({ by: ['type'], where, _count: { _all: true } }),
      prisma.notification.count({ where }),
    ]);
    const byStatus: Record<string, number> = {};
    for (const r of byStatusRaw) byStatus[r.status] = r._count._all;
    const byChannel: Record<string, number> = {};
    for (const r of byChannelRaw) byChannel[r.type] = r._count._all;
    return { total, byStatus, byChannel };
  }

  async create(data: Prisma.NotificationUncheckedCreateInput): Promise<Notification> {
    return prisma.notification.create({ data });
  }

  async markAsRead(id: string): Promise<Notification> {
    return prisma.notification.update({
      where: { id },
      data: { status: 'READ', readAt: new Date() },
    });
  }

  async markAllAsRead(userId: string): Promise<number> {
    const result = await prisma.notification.updateMany({
      where: { userId, status: { not: 'READ' } },
      data: { status: 'READ', readAt: new Date() },
    });
    return result.count;
  }

  async countUnread(userId: string): Promise<number> {
    return prisma.notification.count({
      where: { userId, status: { not: 'READ' } },
    });
  }
}
