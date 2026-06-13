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
    // Inclut employee/carrier pour permettre a la vue detail de naviguer vers
    // l'entite metier liee (employe ou transporteur).
    const c = await prisma.client.findUnique({
      where: { id },
      include: {
        employee: { select: { id: true, fullName: true, position: true } },
        carrier: { select: { id: true, name: true, carrierType: true } },
      },
    });
    if (!c || c.isDeleted) return null;
    return c as Client;
  }

  async findByPhone(phone: string): Promise<Client | null> {
    const c = await prisma.client.findUnique({ where: { phone } });
    if (!c || c.isDeleted) return null;
    return c;
  }

  async findAll(
    filters: { organizationId?: string; agencyId?: string; scopeWhere?: object | null },
    pagination: PaginationInput,
  ): Promise<PaginatedResponse<Client>> {
    const { page, limit, sortBy, sortOrder, search } = pagination;
    const skip = (page - 1) * limit;

    const where: Prisma.ClientWhereInput = {
      isActive: true,
      isDeleted: false,
      ...(filters.organizationId && { organizationId: filters.organizationId }),
      ...(filters.agencyId && { agencyId: filters.agencyId }),
      // Scope agence (etape 2) : merge en AND pour ne pas ecraser le OR de recherche.
      ...(filters.scopeWhere && { AND: [filters.scopeWhere as Prisma.ClientWhereInput] }),
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
          // Lien 1-1 vers Employee / Carrier : permet d'afficher un badge
          // sur la liste clients ("Employe" / "Transporteur").
          employee: { select: { id: true, position: true } },
          carrier: { select: { id: true, name: true, carrierType: true } },
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
