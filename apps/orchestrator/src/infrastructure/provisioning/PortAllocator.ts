import { injectable } from 'tsyringe';
import { prisma } from '../../config/database';
import { BusinessError, NotFoundError } from '../../domain/errors/BusinessError';

/**
 * Alloue 3 ports libres par tenant : api (4000), web staff (3000), web-client (3001).
 * On stocke `apiPort`, `webPort` et `webClientPort` dans le record `Tenant`.
 *
 * Plage par defaut : 30000-39999 (10000 ports = ~3333 tenants/VPS max).
 * Editable par VPS via `VPS.portRangeStart` / `VPS.portRangeEnd` -- utile
 * quand un VPS heberge d'autres services sur certains ports, ou quand on
 * veut isoler la plage par environnement.
 */

const DEFAULT_PORT_RANGE_START = 30000;
const DEFAULT_PORT_RANGE_END = 39999;

@injectable()
export class PortAllocator {
  async allocate(
    vpsId: string,
  ): Promise<{ apiPort: number; webPort: number; webClientPort: number }> {
    const vps = await prisma.vPS.findUnique({
      where: { id: vpsId },
      select: { portRangeStart: true, portRangeEnd: true },
    });
    if (!vps) throw new NotFoundError('VPS', vpsId);
    const start = vps.portRangeStart ?? DEFAULT_PORT_RANGE_START;
    const end = vps.portRangeEnd ?? DEFAULT_PORT_RANGE_END;
    if (start >= end) {
      throw new BusinessError(
        `Plage de ports VPS invalide : start=${start} >= end=${end}`,
      );
    }

    const used = await prisma.tenant.findMany({
      where: {
        vpsId,
        status: { not: 'ARCHIVED' },
        OR: [
          { apiPort: { not: null } },
          { webPort: { not: null } },
          { webClientPort: { not: null } },
        ],
      },
      select: { apiPort: true, webPort: true, webClientPort: true },
    });

    const taken = new Set<number>();
    for (const t of used) {
      if (t.apiPort) taken.add(t.apiPort);
      if (t.webPort) taken.add(t.webPort);
      if (t.webClientPort) taken.add(t.webClientPort);
    }

    const apiPort = this.findFree(taken, start, end);
    taken.add(apiPort);
    const webPort = this.findFree(taken, start, end);
    taken.add(webPort);
    const webClientPort = this.findFree(taken, start, end);

    return { apiPort, webPort, webClientPort };
  }

  private findFree(taken: Set<number>, start: number, end: number): number {
    for (let p = start; p <= end; p++) {
      if (!taken.has(p)) return p;
    }
    throw new BusinessError(
      `Aucun port libre dans la plage tenant ${start}-${end}. VPS sature ou plage trop etroite.`,
    );
  }
}
