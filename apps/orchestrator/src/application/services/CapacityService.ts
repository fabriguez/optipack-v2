import { injectable } from 'tsyringe';
import { prisma } from '../../config/database';
import { BusinessError, NotFoundError } from '../../domain/errors/BusinessError';

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
    const vps = await prisma.vPS.findUnique({ where: { id: vpsId } });
    if (!vps) throw new NotFoundError('VPS', vpsId);

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
