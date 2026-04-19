import { injectable } from 'tsyringe';
import type { Client, Prisma } from '@prisma/client';
import type { IClientRepository } from '../../../application/interfaces/IClientRepository';
import type { PaginationInput, PaginatedResponse } from '@transitsoftservices/shared';
import { prisma } from '../../../config/database';

@injectable()
export class PrismaClientRepository implements IClientRepository {
  async findById(id: string): Promise<Client | null> {
    return prisma.client.findUnique({ where: { id } });
  }

  async findByPhone(phone: string): Promise<Client | null> {
    return prisma.client.findUnique({ where: { phone } });
  }

  async findAll(
    filters: { organizationId?: string; agencyId?: string },
    pagination: PaginationInput,
  ): Promise<PaginatedResponse<Client>> {
    const { page, limit, sortBy, sortOrder, search } = pagination;
    const skip = (page - 1) * limit;

    const where: Prisma.ClientWhereInput = {
      isActive: true,
      ...(filters.organizationId && { organizationId: filters.organizationId }),
      ...(filters.agencyId && { agencyId: filters.agencyId }),
      ...(search && {
        OR: [
          { fullName: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      prisma.client.findMany({
        where,
        skip,
        take: limit,
        orderBy: sortBy ? { [sortBy]: sortOrder } : { createdAt: 'desc' },
        include: {
          agency: { select: { id: true, name: true, code: true } },
          _count: { select: { parcels: true, invoices: true } },
        },
      }),
      prisma.client.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async create(data: Prisma.ClientCreateInput): Promise<Client> {
    return prisma.client.create({ data });
  }

  async update(id: string, data: Prisma.ClientUpdateInput): Promise<Client> {
    return prisma.client.update({ where: { id }, data });
  }

  async delete(id: string): Promise<void> {
    await prisma.client.update({ where: { id }, data: { isActive: false } });
  }
}
