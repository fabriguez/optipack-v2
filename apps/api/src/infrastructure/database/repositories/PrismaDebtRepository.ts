import { injectable } from 'tsyringe';
import type { Debt, Prisma } from '@prisma/client';
import type { IDebtRepository } from '../../../application/interfaces/IDebtRepository';
import type { PaginationInput, PaginatedResponse } from '@transitsoftservices/shared';
import { prisma } from '../../../config/database';

// Relations charges sur les requetes detail/list : tous les liens typees
// + la timeline (paiements + history) sur le detail.
const DEBT_LIST_INCLUDE = {
  agency: { select: { id: true, name: true } },
  client: { select: { id: true, fullName: true, phone: true } },
  employee: { select: { id: true, fullName: true, phone: true } },
  carrier: { select: { id: true, name: true } },
  parcel: { select: { id: true, trackingNumber: true, designation: true } },
  invoice: { select: { id: true, reference: true } },
  agencyCharge: { select: { id: true, label: true } },
} satisfies Prisma.DebtInclude;

const DEBT_DETAIL_INCLUDE = {
  ...DEBT_LIST_INCLUDE,
  payments: {
    orderBy: { createdAt: 'desc' as const },
    include: {
      receivedBy: { select: { id: true, firstName: true, lastName: true } },
      voidedBy: { select: { id: true, firstName: true, lastName: true } },
      agency: { select: { id: true, name: true } },
    },
  },
  histories: {
    orderBy: { createdAt: 'desc' as const },
    include: {
      user: { select: { id: true, firstName: true, lastName: true } },
    },
  },
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  voidedBy: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.DebtInclude;

@injectable()
export class PrismaDebtRepository implements IDebtRepository {
  async findById(id: string): Promise<Debt | null> {
    return prisma.debt.findUnique({
      where: { id },
      include: DEBT_DETAIL_INCLUDE,
    });
  }

  async findByClient(clientId: string): Promise<Debt[]> {
    return prisma.debt.findMany({
      where: { clientId, isCleared: false },
      orderBy: { nextDueDate: 'asc' },
      include: DEBT_LIST_INCLUDE,
    });
  }

  async findAll(
    filters: {
      // Filtres principaux exposes a l'UI : segmentation client/entreprise
      // se fait via `type` (CLIENT vs EMPLOYEE/AGENCY/CARRIER).
      clientId?: string;
      employeeId?: string;
      carrierId?: string;
      agencyId?: string;
      type?: string;
      status?: string;
      category?: string;
      priority?: string;
      // 'overdue_today' : echeance depasse aujourd'hui (nextDueDate < now).
      // 'due_today' : echeance EST aujourd'hui.
      timeFilter?: 'overdue' | 'due_today' | 'open' | undefined;
      // 'company' : raccourci pour types EMPLOYEE+AGENCY+CARRIER (dette entreprise).
      bucket?: 'client' | 'company' | undefined;
    },
    pagination: PaginationInput,
  ): Promise<PaginatedResponse<Debt>> {
    const { page, limit, search } = pagination;
    const skip = (page - 1) * limit;

    const where: Prisma.DebtWhereInput = {
      ...(filters.clientId && { clientId: filters.clientId }),
      ...(filters.employeeId && { employeeId: filters.employeeId }),
      ...(filters.carrierId && { carrierId: filters.carrierId }),
      ...(filters.agencyId && { agencyId: filters.agencyId }),
      ...(filters.type && { type: filters.type as any }),
      ...(filters.status && { status: filters.status as any }),
      ...(filters.category && { category: filters.category as any }),
      ...(filters.priority && { priority: filters.priority as any }),
      ...(filters.timeFilter === 'overdue' && {
        nextDueDate: { lt: new Date() },
        status: { notIn: ['CLEARED', 'CANCELLED'] as any },
      }),
      ...(filters.timeFilter === 'due_today' && {
        nextDueDate: {
          gte: new Date(new Date().setHours(0, 0, 0, 0)),
          lt: new Date(new Date().setHours(24, 0, 0, 0)),
        },
      }),
      ...(filters.timeFilter === 'open' && {
        status: { notIn: ['CLEARED', 'CANCELLED'] as any },
      }),
      ...(filters.bucket === 'client' && { type: 'CLIENT' as const }),
      ...(filters.bucket === 'company' && {
        type: { in: ['EMPLOYEE', 'AGENCY', 'CARRIER'] as const },
      }),
      ...(search && {
        OR: [
          { reference: { contains: search, mode: 'insensitive' as const } },
          { motif: { contains: search, mode: 'insensitive' as const } },
          { creditor: { contains: search, mode: 'insensitive' as const } },
          { client: { fullName: { contains: search, mode: 'insensitive' as const } } },
          { employee: { fullName: { contains: search, mode: 'insensitive' as const } } },
          { carrier: { name: { contains: search, mode: 'insensitive' as const } } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      prisma.debt.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: DEBT_LIST_INCLUDE,
      }),
      prisma.debt.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOverdue(): Promise<Debt[]> {
    return prisma.debt.findMany({
      where: {
        isCleared: false,
        status: { notIn: ['CANCELLED', 'LITIGATED'] },
        OR: [
          { nextDueDate: { lt: new Date() } },
          { dueDateFinal: { lt: new Date() } },
        ],
      },
      include: DEBT_LIST_INCLUDE,
    });
  }

  async create(data: Prisma.DebtCreateInput): Promise<Debt> {
    return prisma.debt.create({ data });
  }

  async update(id: string, data: Prisma.DebtUpdateInput): Promise<Debt> {
    return prisma.debt.update({ where: { id }, data });
  }
}
