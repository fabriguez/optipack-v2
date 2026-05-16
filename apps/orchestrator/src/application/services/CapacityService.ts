import { injectable } from 'tsyringe';
import * as os from 'node:os';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { prisma } from '../../config/database';
import { BusinessError, NotFoundError } from '../../domain/errors/BusinessError';

const execAsync = promisify(exec);

const SELF_VPS_NAME = process.env.OPS_SELF_VPS_NAME ?? 'self';

function isSelfVps(vps: { name: string; host: string }): boolean {
  return vps.name === SELF_VPS_NAME || vps.host === '127.0.0.1' || vps.host === 'localhost';
}

/**
 * Mesure capacite hardware locale (CPU cores, RAM totale, disk total). Lance
 * uniquement quand le VPS self n'a pas de capacite saisie en DB -- evite que
 * le CapacityService voie 0 et bloque toute creation de tenant.
 */
async function measureLocalCapacity(): Promise<{ totalCpu: number; totalRamMb: number; totalDiskGb: number }> {
  let totalDiskGb = 0;
  try {
    const { stdout } = await execAsync("df -k -P / | tail -1 | awk '{print $2}'");
    const sizeKb = parseInt(stdout.trim(), 10) || 0;
    totalDiskGb = Math.round(sizeKb / 1024 / 1024);
  } catch {
    // df indispo : on laisse 0
  }
  return {
    totalCpu: os.cpus().length,
    totalRamMb: Math.round(os.totalmem() / 1024 / 1024),
    totalDiskGb,
  };
}

export interface ResourceRequirement {
  cpuLimit: number;
  memoryMb: number;
  diskQuotaGb: number;
}

export interface CapacityReport {
  vpsId: string;
  totalCpu: number;
  totalRamMb: number;
  totalDiskGb: number;
  reservedCpu: number;
  reservedRamMb: number;
  reservedDiskGb: number;
  effectiveCpu: number; // (total - reserved) * overcommit
  effectiveRamMb: number;
  effectiveDiskGb: number;
  allocatedCpu: number; // somme des plans des tenants ACTIVE/PROVISIONING
  allocatedRamMb: number;
  allocatedDiskGb: number;
  availableCpu: number;
  availableRamMb: number;
  availableDiskGb: number;
  tenantCount: number;
  /** Pourcentage d'utilisation alloue (utile pour l'UI). */
  cpuPct: number;
  ramPct: number;
  diskPct: number;
}

/**
 * Phase 4 — gestion de la capacite VPS et verification avant provisioning/upgrade.
 *
 * Capacite effective = (total - reserve) * overcommit.
 * On somme les plans des tenants ACTIVE et PROVISIONING (= en cours d'install).
 * Les tenants FROZEN comptent aussi (containers stoppes mais DB toujours la,
 * ressources potentiellement reactivables a tout moment).
 * Les ARCHIVED ne comptent pas.
 */
@injectable()
export class CapacityService {
  async report(vpsId: string): Promise<CapacityReport> {
    let vps = await prisma.vPS.findUnique({ where: { id: vpsId } });
    if (!vps) throw new NotFoundError('VPS', vpsId);

    // Lazy populate des totaux du VPS self : sans ca, capacite=0 -> blocage
    // de toute creation de tenant ("VPS sature : 0.00 disponibles"). On le
    // fait au premier appel pour ne pas attendre le cron heartbeat (5min).
    if (
      isSelfVps(vps) &&
      ((vps.totalCpu ?? 0) === 0 || (vps.totalRamMb ?? 0) === 0 || (vps.totalDiskGb ?? 0) === 0)
    ) {
      const cap = await measureLocalCapacity();
      vps = await prisma.vPS.update({
        where: { id: vpsId },
        data: {
          ...(((vps.totalCpu ?? 0) === 0) && { totalCpu: cap.totalCpu }),
          ...(((vps.totalRamMb ?? 0) === 0) && { totalRamMb: cap.totalRamMb }),
          ...(((vps.totalDiskGb ?? 0) === 0) && { totalDiskGb: cap.totalDiskGb }),
        },
      });
    }

    const tenants = await prisma.tenant.findMany({
      where: {
        vpsId,
        status: { in: ['ACTIVE', 'PROVISIONING', 'FROZEN', 'MIGRATING'] },
      },
      include: { resourcePlan: true },
    });

    let allocatedCpu = 0;
    let allocatedRamMb = 0;
    let allocatedDiskGb = 0;

    for (const t of tenants) {
      const cpu = t.customCpuLimit ?? t.resourcePlan?.cpuLimit ?? 0;
      const ram = t.customMemoryMb ?? t.resourcePlan?.memoryMb ?? 0;
      const disk = t.customDiskGb ?? t.resourcePlan?.diskQuotaGb ?? 0;
      allocatedCpu += cpu;
      allocatedRamMb += ram;
      allocatedDiskGb += disk;
    }

    const totalCpu = vps.totalCpu ?? 0;
    const totalRamMb = vps.totalRamMb ?? 0;
    const totalDiskGb = vps.totalDiskGb ?? 0;

    const effectiveCpu = Math.max(0, (totalCpu - vps.reservedCpu) * vps.cpuOvercommit);
    const effectiveRamMb = Math.max(0, (totalRamMb - vps.reservedRamMb) * vps.memoryOvercommit);
    const effectiveDiskGb = Math.max(0, (totalDiskGb - vps.reservedDiskGb) * vps.diskOvercommit);

    return {
      vpsId,
      totalCpu,
      totalRamMb,
      totalDiskGb,
      reservedCpu: vps.reservedCpu,
      reservedRamMb: vps.reservedRamMb,
      reservedDiskGb: vps.reservedDiskGb,
      effectiveCpu,
      effectiveRamMb,
      effectiveDiskGb,
      allocatedCpu,
      allocatedRamMb,
      allocatedDiskGb,
      availableCpu: Math.max(0, effectiveCpu - allocatedCpu),
      availableRamMb: Math.max(0, effectiveRamMb - allocatedRamMb),
      availableDiskGb: Math.max(0, effectiveDiskGb - allocatedDiskGb),
      tenantCount: tenants.length,
      cpuPct: effectiveCpu > 0 ? (allocatedCpu / effectiveCpu) * 100 : 0,
      ramPct: effectiveRamMb > 0 ? (allocatedRamMb / effectiveRamMb) * 100 : 0,
      diskPct: effectiveDiskGb > 0 ? (allocatedDiskGb / effectiveDiskGb) * 100 : 0,
    };
  }

  /**
   * Verifie qu'un VPS peut accueillir une charge supplementaire (nouveau tenant ou upgrade).
   * `excludeTenantId` est utile pour les upgrades : on retire la conso actuelle du tenant
   * avant de comparer.
   */
  async assertCanAllocate(
    vpsId: string,
    requirement: ResourceRequirement,
    options: { excludeTenantId?: string } = {},
  ): Promise<void> {
    const report = await this.report(vpsId);

    let availCpu = report.availableCpu;
    let availRam = report.availableRamMb;
    let availDisk = report.availableDiskGb;

    if (options.excludeTenantId) {
      const t = await prisma.tenant.findUnique({
        where: { id: options.excludeTenantId },
        include: { resourcePlan: true },
      });
      if (t) {
        availCpu += t.customCpuLimit ?? t.resourcePlan?.cpuLimit ?? 0;
        availRam += t.customMemoryMb ?? t.resourcePlan?.memoryMb ?? 0;
        availDisk += t.customDiskGb ?? t.resourcePlan?.diskQuotaGb ?? 0;
      }
    }

    if (requirement.cpuLimit > availCpu) {
      throw new BusinessError(
        `VPS sature : CPU ${requirement.cpuLimit} demandes, ${availCpu.toFixed(2)} disponibles`,
      );
    }
    if (requirement.memoryMb > availRam) {
      throw new BusinessError(
        `VPS sature : RAM ${requirement.memoryMb} MB demandes, ${availRam.toFixed(0)} MB disponibles`,
      );
    }
    if (requirement.diskQuotaGb > availDisk) {
      throw new BusinessError(
        `VPS sature : disque ${requirement.diskQuotaGb} GB demandes, ${availDisk} GB disponibles`,
      );
    }
  }

  /**
   * Renvoie les limites effectives appliquees au tenant (custom > plan > defaut).
   */
  async getTenantLimits(
    tenantId: string,
  ): Promise<ResourceRequirement & { source: 'custom' | 'plan' | 'default' }> {
    const t = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { resourcePlan: true },
    });
    if (!t) throw new NotFoundError('Tenant', tenantId);

    if (t.customCpuLimit && t.customMemoryMb && t.customDiskGb) {
      return {
        cpuLimit: t.customCpuLimit,
        memoryMb: t.customMemoryMb,
        diskQuotaGb: t.customDiskGb,
        source: 'custom',
      };
    }
    if (t.resourcePlan) {
      return {
        cpuLimit: t.customCpuLimit ?? t.resourcePlan.cpuLimit,
        memoryMb: t.customMemoryMb ?? t.resourcePlan.memoryMb,
        diskQuotaGb: t.customDiskGb ?? t.resourcePlan.diskQuotaGb,
        source: 'plan',
      };
    }
    // Defaut conservateur si aucun plan
    return { cpuLimit: 0.5, memoryMb: 512, diskQuotaGb: 5, source: 'default' };
  }
}
