import { injectable } from 'tsyringe';
import { prisma } from '../../config/database';
import { createChildLogger } from '../../config/logger';

const logger = createChildLogger('CoherenceService');

/**
 * Phase 0 #02 — Verifie l'invariant `parcel.warehouseId XOR parcel.containerId`.
 *
 * Le schema Prisma ne peut pas exprimer un XOR partiel proprement (Postgres CHECK
 * constraint serait possible mais lourd avec les autres status). On fait donc un
 * scan periodique : si un parcel a les deux ou aucun (sauf statuts terminaux), on log.
 *
 * Statuts ou aucun des deux est tolere : DELIVERED, LOST, ARRIVED, RECEIVED.
 * Statuts ou EXACTEMENT un est requis : IN_STOCK, LOADING, IN_TRANSIT.
 */
@injectable()
export class CoherenceService {
  async checkParcelLocations(): Promise<{
    bothSet: number;
    neitherSet: number;
    sampleIds: string[];
  }> {
    const offending = await prisma.parcel.findMany({
      where: {
        OR: [
          { AND: [{ warehouseId: { not: null } }, { containerId: { not: null } }] },
          {
            AND: [
              { warehouseId: null },
              { containerId: null },
              { status: { in: ['IN_STOCK', 'LOADING', 'IN_TRANSIT'] } },
            ],
          },
        ],
      },
      select: { id: true, status: true, warehouseId: true, containerId: true },
      take: 100,
    });

    let bothSet = 0;
    let neitherSet = 0;
    for (const p of offending) {
      if (p.warehouseId && p.containerId) bothSet++;
      else neitherSet++;
    }

    if (offending.length > 0) {
      logger.warn(
        {
          bothSet,
          neitherSet,
          sample: offending.slice(0, 5),
        },
        '[coherence] invariant warehouseId XOR containerId viole',
      );
    }

    return {
      bothSet,
      neitherSet,
      sampleIds: offending.map((p) => p.id),
    };
  }
}

