import { injectable } from 'tsyringe';
import type { Agency, Prisma } from '@prisma/client';
import type { IAgencyRepository } from '../../../application/interfaces/IAgencyRepository';
import type { PaginationInput, PaginatedResponse } from '@transitsoftservices/shared';
import { prisma } from '../../../config/database';
import { safeOrderBy } from '../../../domain/utils/safeOrderBy';

// Colonnes scalaires triables (allowlist anti sort-injection).
const AGENCY_SORTABLE = [
  'id',
  'name',
  'code',
  'city',
  'country',
  'isActive',
  'createdAt',
  'updatedAt',
];

@injectable()
export class PrismaAgencyRepository implements IAgencyRepository {
  async findById(id: string): Promise<Agency | null> {
    return prisma.agency.findUnique({ where: { id } });
  }

  async findByCode(code: string): Promise<Agency | null> {
    return prisma.agency.findUnique({ where: { code } });
  }

  async findAll(
    organizationId: string,
    pagination: PaginationInput,
  ): Promise<PaginatedResponse<Agency>> {
    const { page, limit, sortBy, sortOrder, search } = pagination;
    const skip = (page - 1) * limit;

    const where: Prisma.AgencyWhereInput = {
      organizationId,
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { city: { contains: search, mode: 'insensitive' } },
          { code: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      prisma.agency.findMany({
        where,
        skip,
        take: limit,
        orderBy: safeOrderBy(sortBy, sortOrder, AGENCY_SORTABLE, 'createdAt'),
        include: {
          responsibleUser: { select: { id: true, firstName: true, lastName: true } },
          _count: { select: { warehouses: true } },
        },
      }),
      prisma.agency.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async create(data: Prisma.AgencyCreateInput): Promise<Agency> {
    return prisma.agency.create({ data });
  }

  async update(id: string, data: Prisma.AgencyUpdateInput): Promise<Agency> {
    return prisma.agency.update({ where: { id }, data });
  }

  async delete(id: string): Promise<void> {
    await prisma.agency.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async count(organizationId: string): Promise<number> {
    return prisma.agency.count({ where: { organizationId } });
  }
}
