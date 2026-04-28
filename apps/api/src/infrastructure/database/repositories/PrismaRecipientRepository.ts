import { injectable } from 'tsyringe';
import type { Recipient, Prisma } from '@prisma/client';
import type { IRecipientRepository } from '../../../application/interfaces/IRecipientRepository';
import type { PaginationInput, PaginatedResponse } from '@transitsoftservices/shared';
import { prisma } from '../../../config/database';

@injectable()
export class PrismaRecipientRepository implements IRecipientRepository {
  async findById(id: string): Promise<Recipient | null> {
    return prisma.recipient.findUnique({ where: { id } });
  }

  async findByAgency(
    agencyId: string,
    pagination: PaginationInput,
  ): Promise<PaginatedResponse<Recipient>> {
    const { page, limit, sortBy, sortOrder, search } = pagination;
    const skip = (page - 1) * limit;

    const where: Prisma.RecipientWhereInput = {
      agencyId,
      ...(search && {
        OR: [
          { fullName: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      prisma.recipient.findMany({
        where,
        skip,
        take: limit,
        orderBy: sortBy ? { [sortBy]: sortOrder } : { createdAt: 'desc' },
        include: {
          agency: { select: { id: true, name: true, code: true } },
        },
      }),
      prisma.recipient.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findAll(
    filters: { agencyIds?: string[] },
    pagination: PaginationInput,
  ): Promise<PaginatedResponse<Recipient>> {
    const { page, limit, sortBy, sortOrder, search } = pagination;
    const skip = (page - 1) * limit;

    const where: Prisma.RecipientWhereInput = {
      ...(filters.agencyIds && filters.agencyIds.length > 0 && { agencyId: { in: filters.agencyIds } }),
      ...(search && {
        OR: [
          { fullName: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      prisma.recipient.findMany({
        where,
        skip,
        take: limit,
        orderBy: sortBy ? { [sortBy]: sortOrder } : { createdAt: 'desc' },
        include: { agency: { select: { id: true, name: true, code: true } } },
      }),
      prisma.recipient.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async create(data: Prisma.RecipientCreateInput): Promise<Recipient> {
    return prisma.recipient.create({ data });
  }

  async update(id: string, data: Prisma.RecipientUpdateInput): Promise<Recipient> {
    return prisma.recipient.update({ where: { id }, data });
  }

  async delete(id: string): Promise<void> {
    await prisma.recipient.delete({ where: { id } });
  }
}
