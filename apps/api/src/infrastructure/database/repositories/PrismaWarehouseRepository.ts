import { injectable } from 'tsyringe';
import type { Warehouse, Prisma } from '@prisma/client';
import type { IWarehouseRepository } from '../../../application/interfaces/IWarehouseRepository';
import type { PaginationInput, PaginatedResponse } from '@optipack/shared';
import { prisma } from '../../../config/database';

@injectable()
export class PrismaWarehouseRepository implements IWarehouseRepository {
  async findById(id: string): Promise<Warehouse | null> {
    return prisma.warehouse.findUnique({ where: { id } });
  }

  async findByAgency(
    agencyId: string,
    pagination: PaginationInput,
  ): Promise<PaginatedResponse<Warehouse>> {
    const { page, limit, sortBy, sortOrder, search } = pagination;
    const skip = (page - 1) * limit;

    const where: Prisma.WarehouseWhereInput = {
      agencyId,
      isActive: true,
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { location: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      prisma.warehouse.findMany({
        where,
        skip,
        take: limit,
        orderBy: sortBy ? { [sortBy]: sortOrder } : { createdAt: 'desc' },
        include: {
          agency: { select: { id: true, name: true, code: true } },
          _count: { select: { parcels: true } },
        },
      }),
      prisma.warehouse.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findByAgencies(
    agencyIds: string[],
    pagination: PaginationInput,
    agencyId?: string,
  ): Promise<PaginatedResponse<Warehouse>> {
    const { page, limit, sortBy, sortOrder, search } = pagination;
    const skip = (page - 1) * limit;

    const where: Prisma.WarehouseWhereInput = {
      agencyId: agencyId ? { equals: agencyId, in: agencyIds } : { in: agencyIds },
      isActive: true,
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { location: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      prisma.warehouse.findMany({
        where,
        skip,
        take: limit,
        orderBy: sortBy ? { [sortBy]: sortOrder } : { createdAt: 'desc' },
        include: {
          agency: { select: { id: true, name: true, code: true } },
          _count: { select: { parcels: true } },
        },
      }),
      prisma.warehouse.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async create(data: Prisma.WarehouseCreateInput): Promise<Warehouse> {
    return prisma.warehouse.create({ data });
  }

  async update(id: string, data: Prisma.WarehouseUpdateInput): Promise<Warehouse> {
    return prisma.warehouse.update({ where: { id }, data });
  }

  async delete(id: string): Promise<void> {
    await prisma.warehouse.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
