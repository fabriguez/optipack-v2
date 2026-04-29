import { injectable } from 'tsyringe';
import { prisma } from '../../config/database';
import {
  provisionQueue,
  freezeQueue,
  unfreezeQueue,
  deleteQueue,
  migrateQueue,
  updateQueue,
  rollbackQueue,
} from '../queue/queues';
import { monitoringQueue } from '../queue/monitoring';

/**
 * Phase 5 — endpoint /metrics au format Prometheus text exposition.
 *
 * Implementation manuelle (pas de prom-client) : on calcule a la demande les counters
 * BullMQ + des stats DB. Suffisant pour un orchestrateur a faible QPS.
 *
 * Exposes :
 *  - optipack_http_requests_total{method,status} : compteur par requete (incremente via middleware)
 *  - optipack_bullmq_jobs{queue,state} : depth par etat (waiting/active/delayed/failed)
 *  - optipack_tenants{status} : nombre de tenants par status
 *  - optipack_vps{status} : nombre de VPS par status
 */

const queues = [
  ['provision', provisionQueue],
  ['freeze', freezeQueue],
  ['unfreeze', unfreezeQueue],
  ['delete', deleteQueue],
  ['migrate', migrateQueue],
  ['update', updateQueue],
  ['rollback', rollbackQueue],
  ['monitoring', monitoringQueue],
] as const;

@injectable()
export class MetricsService {
  // Compteurs HTTP : { "GET 200": 42 }
  private httpCounters = new Map<string, number>();

  trackHttp(method: string, status: number) {
    const key = `${method} ${status}`;
    this.httpCounters.set(key, (this.httpCounters.get(key) ?? 0) + 1);
  }

  async render(): Promise<string> {
    const lines: string[] = [];

    // HTTP
    lines.push('# HELP optipack_http_requests_total Total HTTP requests');
    lines.push('# TYPE optipack_http_requests_total counter');
    for (const [key, count] of this.httpCounters.entries()) {
      const [method, status] = key.split(' ');
      lines.push(
        `optipack_http_requests_total{method="${method}",status="${status}"} ${count}`,
      );
    }

    // BullMQ
    lines.push('# HELP optipack_bullmq_jobs Jobs in queue by state');
    lines.push('# TYPE optipack_bullmq_jobs gauge');
    for (const [name, q] of queues) {
      const counts = await q.getJobCounts(
        'waiting',
        'active',
        'delayed',
        'failed',
        'completed',
      );
      for (const state of ['waiting', 'active', 'delayed', 'failed', 'completed'] as const) {
        lines.push(
          `optipack_bullmq_jobs{queue="${name}",state="${state}"} ${counts[state] ?? 0}`,
        );
      }
    }

    // Tenants
    lines.push('# HELP optipack_tenants Tenants by status');
    lines.push('# TYPE optipack_tenants gauge');
    const tenants = await prisma.tenant.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    for (const t of tenants) {
      lines.push(`optipack_tenants{status="${t.status}"} ${t._count._all}`);
    }

    // VPS
    lines.push('# HELP optipack_vps VPS by status');
    lines.push('# TYPE optipack_vps gauge');
    const vps = await prisma.vPS.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    for (const v of vps) {
      lines.push(`optipack_vps{status="${v.status}"} ${v._count._all}`);
    }

    return lines.join('\n') + '\n';
  }
}
