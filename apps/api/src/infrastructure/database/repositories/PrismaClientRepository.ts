import { injectable } from 'tsyringe';
import type { Client, Prisma } from '@prisma/client';
import type { IClientRepository } from '../../../application/interfaces/IClientRepository';
import type { PaginationInput, PaginatedResponse } from '@transitsoftservices/shared';
import { prisma } from '../../../config/database';

@injectable()
export class PrismaClientRepository implements IClientRepository {
  async findById(id: string): Promise<Client | null> {
    // Les clients supprimes (soft delete) sont invisibles pour l'application,
    // sauf pour l'audit qui peut les retrouver via le client Prisma directement.
    const c = await prisma.client.findUnique({ where: { id } });
    if (!c || c.isDeleted) return null;
    return c;
  }

  async findByPhone(phone: string): Promise<Client | null> {
    const c = await prisma.client.findUnique({ where: { phone } });
    if (!c || c.isDeleted) return null;
    return c;
  }

  async findAll(
    filters: { organizationId?: string; agencyId?: string },
    pagination: PaginationInput,
  ): Promise<PaginatedResponse<Client>> {
    const { page, limit, sortBy, sortOrder, search } = pagination;
    const skip = (page - 1) * limit;

    const where: Prisma.ClientWhereInput = {
      isActive: true,
      isDeleted: false,
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
    // Soft delete : conserve la ligne pour l'audit (colis lies, factures, ...)
    // mais la masque de toutes les requetes applicatives via isDeleted=true.
    await prisma.client.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date(), isActive: false },
    });
  }
}
