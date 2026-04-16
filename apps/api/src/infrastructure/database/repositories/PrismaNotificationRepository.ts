import { injectable } from 'tsyringe';
import type { Notification, Prisma } from '@prisma/client';
import type {
  INotificationRepository,
  NotificationWithRelations,
} from '../../../application/interfaces/INotificationRepository';
import type { PaginationInput, PaginatedResponse } from '@optipack/shared';
import { prisma } from '../../../config/database';

const NOTIFICATION_INCLUDE = {
  agency: { select: { id: true, name: true } },
  client: { select: { id: true, fullName: true, phone: true } },
};

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
