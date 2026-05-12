import { injectable } from 'tsyringe';
import { prisma } from '../../../config/database';
import { config } from '../../../config';
import { BusinessError, ConflictError, NotFoundError } from '../../../domain/errors/BusinessError';

// Schemas migres dans @transitsoftservices/ops-schemas.
import {
  createReleaseSchema,
  updateReleaseSchema,
  type CreateReleaseInput,
  type UpdateReleaseInput,
} from '@transitsoftservices/ops-schemas';
export { createReleaseSchema, updateReleaseSchema };
export type { CreateReleaseInput, UpdateReleaseInput };

@injectable()
export class ReleaseUseCases {
  async list(filters: {
    isPublished?: boolean;
    q?: string;
    page: number;
    pageSize: number;
  }) {
    const where = {
      ...(filters.isPublished !== undefined && { isPublished: filters.isPublished }),
      ...(filters.q && {
        OR: [
          { version: { contains: filters.q, mode: 'insensitive' as const } },
          { changelog: { contains: filters.q, mode: 'insensitive' as const } },
        ],
      }),
    };
    const [items, total] = await Promise.all([
      prisma.release.findMany({
        where,
        orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      prisma.release.count({ where }),
    ]);
    return { items, total };
  }

  async getByVersion(version: string) {
    const r = await prisma.release.findUnique({ where: { version } });
    if (!r) throw new NotFoundError('Release', version);
    return r;
  }

  /**
   * Cree un record Release (suite a un tag GHCR detecte ou une saisie manuelle).
   * `isPublished = false` par defaut : le super-admin doit explicitement publier
   * pour que les tenants soient notifies.
   */
  async create(input: CreateReleaseInput) {
    const dup = await prisma.release.findUnique({ where: { version: input.version } });
    if (dup) throw new ConflictError(`Release ${input.version} existe deja`);

    const ns = config.ghcr.namespace;
    return prisma.release.create({
      data: {
        version: input.version,
        apiImageTag: input.apiImageTag ?? `ghcr.io/${ns}/optipack-api:${input.version}`,
        webImageTag: input.webImageTag ?? `ghcr.io/${ns}/optipack-web:${input.version}`,
        changelog: input.changelog ?? null,
        isStable: input.isStable ?? false,
        isCritical: input.isCritical ?? false,
        isPublished: false,
      },
    });
  }

  async update(id: string, input: UpdateReleaseInput) {
    const r = await prisma.release.findUnique({ where: { id } });
    if (!r) throw new NotFoundError('Release', id);
    return prisma.release.update({
      where: { id },
      data: {
        ...(input.changelog !== undefined && { changelog: input.changelog }),
        ...(input.isStable !== undefined && { isStable: input.isStable }),
        ...(input.isCritical !== undefined && { isCritical: input.isCritical }),
      },
    });
  }

  /**
   * Publie une release : la rend visible par les tenants (via leur dashboard).
   * Une fois publiee, elle ne peut plus etre depubliee (cohérence des notifications).
   */
  async publish(id: string, opsAdminId: string) {
    const r = await prisma.release.findUnique({ where: { id } });
    if (!r) throw new NotFoundError('Release', id);
    if (r.isPublished) throw new BusinessError('Release deja publiee');

    return prisma.release.update({
      where: { id },
      data: {
        isPublished: true,
        publishedAt: new Date(),
        publishedById: opsAdminId,
      },
    });
  }

  /**
   * Trouve la release publiee la plus recente, optionnellement filtree par stable/critical.
   * Utilise par les tenants via /api/v1/system/updates pour savoir s'ils ont du retard.
   */
  async latestPublished(filters: { stableOnly?: boolean } = {}) {
    return prisma.release.findFirst({
      where: {
        isPublished: true,
        ...(filters.stableOnly && { isStable: true }),
      },
      orderBy: { publishedAt: 'desc' },
    });
  }
}
