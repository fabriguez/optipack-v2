import type { AuditLog, Prisma } from '@prisma/client';
import type { PaginationInput, PaginatedResponse } from '@transitsoftservices/shared';

export interface IAuditLogRepository {
  create(data: Prisma.AuditLogCreateInput): Promise<AuditLog>;
  findAll(
    filters: { userId?: string; agencyId?: string; entityType?: string },
    pagination: PaginationInput,
  ): Promise<PaginatedResponse<AuditLog>>;
}

export const AUDIT_LOG_REPOSITORY = Symbol.for('IAuditLogRepository');
