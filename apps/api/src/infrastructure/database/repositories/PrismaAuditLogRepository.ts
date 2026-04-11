import { injectable } from 'tsyringe';
import type { AuditLog, Prisma } from '@prisma/client';
import type { IAuditLogRepository } from '../../../application/interfaces/IAuditLogRepository';
import type { PaginationInput, PaginatedResponse } from '@optipack/shared';
import { prisma } from '../../../config/database';

@injectable()
export class PrismaAuditLogRepository implements IAuditLogRepository {
  async create(data: Prisma.AuditLogCreateInput): Promise<AuditLog> {
    return prisma.auditLog.create({ data });
  }

  async findAll(
    filters: { userId?: string; agencyId?: string; entityType?: string },
    pagination: PaginationInput,
  ): Promise<PaginatedResponse<AuditLog>> {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const where: Prisma.AuditLogWhereInput = {
      ...(filters.userId && { userId: filters.userId }),
      ...(filters.agencyId && { agencyId: filters.agencyId }),
      ...(filters.entityType && { entityType: filters.entityType }),
    };

    const [data, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}
