import { injectable } from 'tsyringe';
import type { Warehouse, Prisma } from '@prisma/client';
import type { IWarehouseRepository } from '../../../application/interfaces/IWarehouseRepository';
import type { PaginationInput, PaginatedResponse } from '@transitsoftservices/shared';
import { prisma } from '../../../config/database';

@injectable()
export class PrismaWarehouseRepository implements IWarehouseRepository {
  async findById(id: string): Promise<Warehouse | null> {
    return prisma.warehouse.findUnique({
      where: { id },
      include: {
        agency: { select: { id: true, name: true, code: true, imageUrl: true, city: true } },
      },
    }) as Promise<Warehouse | null>;
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
          agency: { select: { id: true, name: true, code: true, imageUrl: true, city: true } },
          // Compteur aligne avec le listing detail (page magasin) :
          // colis presents physiquement + non archives + non supprimes + en stock.
          // Sans ces filtres, on compte des colis deja livres / lost / archives,
          // ce qui faisait diverger la liste (2 colis) et le detail (0).
          _count: {
            select: {
              parcels: {
                where: {
                  isDeleted: false,
                  isArchived: false,
                  isPresent: true,
                  status: { in: ['IN_STOCK', 'RECEIVED'] },
                },
              },
            },
          },
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
    agencyIds: string[] | null,
    pagination: PaginationInput,
    agencyId?: string,
  ): Promise<PaginatedResponse<Warehouse>> {
    const { page, limit, sortBy, sortOrder, search } = pagination;
    const skip = (page - 1) * limit;

    const agencyFilter: Prisma.WarehouseWhereInput =
      agencyIds === null
        ? agencyId
          ? { agencyId }
          : {}
        : { agencyId: agencyId ? { equals: agencyId, in: agencyIds } : { in: agencyIds } };

    const where: Prisma.WarehouseWhereInput = {
      ...agencyFilter,
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
          agency: { select: { id: true, name: true, code: true, imageUrl: true, city: true } },
          // Compteur aligne avec le listing detail (page magasin) :
          // colis presents physiquement + non archives + non supprimes + en stock.
          // Sans ces filtres, on compte des colis deja livres / lost / archives,
          // ce qui faisait diverger la liste (2 colis) et le detail (0).
          _count: {
            select: {
              parcels: {
                where: {
                  isDeleted: false,
                  isArchived: false,
                  isPresent: true,
                  status: { in: ['IN_STOCK', 'RECEIVED'] },
                },
              },
            },
          },
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
