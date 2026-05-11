import { injectable } from 'tsyringe';
import { prisma } from '../../config/database';
import { BusinessError } from '../../domain/errors/BusinessError';

/**
 * Alloue 3 ports libres par tenant : api (4000), web staff (3000), web-client (3001).
 * On stocke `apiPort`, `webPort` et `webClientPort` dans le record `Tenant`.
 *
 * Plage : 30000-39999 (10000 ports = ~3333 tenants/VPS max).
 */

const PORT_RANGE_START = 30000;
const PORT_RANGE_END = 39999;

@injectable()
export class PortAllocator {
  async allocate(
    vpsId: string,
  ): Promise<{ apiPort: number; webPort: number; webClientPort: number }> {
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

    const apiPort = this.findFree(taken);
    taken.add(apiPort);
    const webPort = this.findFree(taken);
    taken.add(webPort);
    const webClientPort = this.findFree(taken);

    return { apiPort, webPort, webClientPort };
  }

  private findFree(taken: Set<number>): number {
    for (let p = PORT_RANGE_START; p <= PORT_RANGE_END; p++) {
      if (!taken.has(p)) return p;
    }
    throw new BusinessError('Aucun port libre dans la plage tenant. VPS sature ?');
  }
}
