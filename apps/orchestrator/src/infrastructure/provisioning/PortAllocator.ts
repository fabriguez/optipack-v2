import { injectable } from 'tsyringe';
import { prisma } from '../../config/database';
import { BusinessError } from '../../domain/errors/BusinessError';

/**
 * Alloue 2 ports libres dans la plage tenant pour un VPS donne.
 * On stocke `apiPort` et `webPort` dans le record `Tenant`. Pour eviter les conflits
 * on lit les ports deja attribues sur ce VPS et on prend les premiers libres.
 *
 * Plage : 30000-39999 (10000 ports = 5000 tenants/VPS max).
 */

const PORT_RANGE_START = 30000;
const PORT_RANGE_END = 39999;

@injectable()
export class PortAllocator {
  async allocate(vpsId: string): Promise<{ apiPort: number; webPort: number }> {
    const used = await prisma.tenant.findMany({
      where: {
        vpsId,
        status: { not: 'ARCHIVED' },
        OR: [{ apiPort: { not: null } }, { webPort: { not: null } }],
      },
      select: { apiPort: true, webPort: true },
    });

    const taken = new Set<number>();
    for (const t of used) {
      if (t.apiPort) taken.add(t.apiPort);
      if (t.webPort) taken.add(t.webPort);
    }

    const apiPort = this.findFree(taken);
    taken.add(apiPort);
    const webPort = this.findFree(taken);

    return { apiPort, webPort };
  }

  private findFree(taken: Set<number>): number {
    for (let p = PORT_RANGE_START; p <= PORT_RANGE_END; p++) {
      if (!taken.has(p)) return p;
    }
    throw new BusinessError('Aucun port libre dans la plage tenant. VPS sature ?');
  }
}
