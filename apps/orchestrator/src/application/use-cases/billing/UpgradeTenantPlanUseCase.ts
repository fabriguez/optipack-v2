import { inject, injectable } from 'tsyringe';
import { z } from 'zod';
import { prisma } from '../../../config/database';
import { config } from '../../../config';
import { DockerService, DOCKER_SERVICE } from '../../../infrastructure/docker/DockerService';
import { CapacityService } from '../../services/CapacityService';
import { BusinessError, NotFoundError } from '../../../domain/errors/BusinessError';

export const requestUpgradeSchema = z.object({
  toPlanCode: z.string(),
  // Indique qui demande : tenant_owner via son dashboard, ou ops_admin manuel
  requestedBy: z.enum(['tenant_owner', 'ops_admin']).default('ops_admin'),
});

export type RequestUpgradeInput = z.infer<typeof requestUpgradeSchema>;

/**
 * Phase 4 — flow upgrade plan tenant.
 *
 * Etape 1 : `requestUpgrade` cree un PlanChange status="pending_payment" et renvoie
 *           les infos de checkout (URL Stripe / instructions MoMo).
 *
 * Etape 2 (apres paiement reussi via webhook ou validation manuelle) :
 *           `applyPlanChange` : applique les nouvelles limites + restart les
 *           containers du tenant avec --cpus/--memory ajustes.
 *
 * Cas particuliers :
 * - Si le nouveau plan demande plus de ressources que disponible sur le VPS,
 *   on rejette tot (avant paiement) avec une erreur capacity.
 * - Si le tenant downgrade (passe a un plan moins cher), on applique sans paiement
 *   (l'ops admin peut le forcer ; le pro-rata est laisse a la facturation).
 */
@injectable()
export class UpgradeTenantPlanUseCase {
  constructor(
    @inject(DOCKER_SERVICE) private docker: DockerService,
    private capacity: CapacityService,
  ) {}

  /**
   * Etape 1 : creer un PlanChange en attente de paiement.
   */
  async requestUpgrade(tenantId: string, input: RequestUpgradeInput) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { resourcePlan: true, vps: true },
    });
    if (!tenant) throw new NotFoundError('Tenant', tenantId);
    if (tenant.status === 'ARCHIVED') throw new BusinessError('Tenant archive');

    const toPlan = await prisma.resourcePlan.findUnique({ where: { code: input.toPlanCode } });
    if (!toPlan) throw new NotFoundError('Plan', input.toPlanCode);
    if (!toPlan.isActive) throw new BusinessError('Plan desactive');

    // Empeche les changements en double si un est deja pending
    const pending = await prisma.planChange.findFirst({
      where: { tenantId, status: 'pending_payment' },
    });
    if (pending) {
      throw new BusinessError('Un changement de plan est deja en attente de paiement.');
    }

    // Capacity check anticipe sur le plan cible (sans paiement, on bloque tot)
    await this.capacity.assertCanAllocate(
      tenant.vpsId,
      {
        cpuLimit: toPlan.cpuLimit,
        memoryMb: toPlan.memoryMb,
        diskQuotaGb: toPlan.diskQuotaGb,
      },
      { excludeTenantId: tenantId },
    );

    const isDowngrade =
      tenant.resourcePlan != null && Number(toPlan.pricePerMonth) < Number(tenant.resourcePlan.pricePerMonth);

    const change = await prisma.planChange.create({
      data: {
        tenantId,
        fromPlanId: tenant.resourcePlanId,
        toPlanId: toPlan.id,
        status: isDowngrade ? 'active' : 'pending_payment',
        requestedBy: input.requestedBy,
        cpuLimitAtChange: toPlan.cpuLimit,
        memoryMbAtChange: toPlan.memoryMb,
        diskGbAtChange: toPlan.diskQuotaGb,
      },
    });

    // Si downgrade : pas de paiement, on applique direct
    if (isDowngrade) {
      await this.applyPlanChange(change.id);
      return { ...change, status: 'active', requiresPayment: false };
    }

    return { ...change, requiresPayment: true, plan: toPlan };
  }

  /**
   * Etape 2 : applique le changement (a appeler apres webhook payment ou manuellement).
   * - Update tenant.resourcePlanId
   * - Restart les containers avec les nouvelles limites
   */
  async applyPlanChange(planChangeId: string): Promise<void> {
    const change = await prisma.planChange.findUnique({
      where: { id: planChangeId },
      include: { toPlan: true, tenant: { include: { vps: true } } },
    });
    if (!change) throw new NotFoundError('PlanChange', planChangeId);
    if (change.status === 'active') return; // deja applique
    if (!change.tenant.vps) throw new BusinessError('Tenant sans VPS');

    const tenant = change.tenant;
    const plan = change.toPlan;

    // 1. Update tenant
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        resourcePlanId: plan.id,
        // On reset les overrides custom : le plan reprend la main.
        customCpuLimit: null,
        customMemoryMb: null,
        customDiskGb: null,
      },
    });

    // 2. Restart containers avec nouvelles limites (si tenant ACTIVE)
    if (tenant.status === 'ACTIVE' && tenant.apiPort && tenant.webPort) {
      const creds = {
        host: tenant.vps.host,
        port: tenant.vps.port,
        username: tenant.vps.username,
        sshKeyEncrypted: tenant.vps.sshKeyEncrypted,
      };
      const apiName = `tenant-${tenant.slug}-api`;
      const webName = `tenant-${tenant.slug}-web`;
      const netName = `tenant-${tenant.slug}-net`;
      const envFile = `${config.tenantEnvDir}/tenant-${tenant.slug}.env`;
      const apiImage = `ghcr.io/${config.ghcr.namespace}/optipack-api:${tenant.currentVersion ?? 'latest'}`;
      const webImage = `ghcr.io/${config.ghcr.namespace}/optipack-web:${tenant.currentVersion ?? 'latest'}`;

      // Stop + remove + run avec nouvelles limites
      const halfCpu = plan.cpuLimit / 2;
      const apiMem = Math.floor(plan.memoryMb * 0.6);
      const webMem = plan.memoryMb - apiMem;

      await this.docker.remove(creds, apiName, true);
      await this.docker.remove(creds, webName, true);

      await this.docker.run(creds, {
        name: apiName,
        image: apiImage,
        ports: { [tenant.apiPort]: 4000 },
        envFile,
        restart: 'unless-stopped',
        network: netName,
        cpuLimit: halfCpu,
        memoryMb: apiMem,
      });
      await this.docker.run(creds, {
        name: webName,
        image: webImage,
        ports: { [tenant.webPort]: 3000 },
        env: {
          TENANT_SLUG: tenant.slug,
          NEXT_PUBLIC_API_URL: `https://api.${tenant.slug}.${process.env.OPS_BASE_DOMAIN ?? 'transitsoftservices.com'}/api/v1`,
          INTERNAL_API_URL: `http://${apiName}:4000/api/v1`,
        },
        restart: 'unless-stopped',
        network: netName,
        cpuLimit: halfCpu,
        memoryMb: webMem,
      });
    }

    // 3. Marquer PlanChange comme applique
    await prisma.planChange.update({
      where: { id: planChangeId },
      data: { status: 'active', effectiveAt: new Date() },
    });
  }

  async cancel(planChangeId: string): Promise<void> {
    const change = await prisma.planChange.findUnique({ where: { id: planChangeId } });
    if (!change) throw new NotFoundError('PlanChange', planChangeId);
    if (change.status === 'active') throw new BusinessError('Changement deja applique');
    await prisma.planChange.update({
      where: { id: planChangeId },
      data: { status: 'cancelled' },
    });
  }
}
