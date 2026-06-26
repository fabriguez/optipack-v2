import { inject, injectable } from 'tsyringe';
import { z } from 'zod';
import { prisma } from '../../../config/database';
import { config } from '../../../config';
import { DockerService, DOCKER_SERVICE } from '../../../infrastructure/docker/DockerService';
import { SSHService, SSH_SERVICE } from '../../../infrastructure/ssh/SSHService';
import { CapacityService } from '../../services/CapacityService';
import { computeServiceLimits } from '../../services/resourceLimits';
import { ProvisioningJobLogger } from '../provisioning/ProvisioningJobLogger';
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
    @inject(SSH_SERVICE) private ssh: SSHService,
    private capacity: CapacityService,
    private jobLogger: ProvisioningJobLogger,
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

    // Application immediate SANS paiement quand :
    //  - l'ops global declenche le changement (requestedBy = 'ops_admin'), OU
    //  - c'est un downgrade (moins cher -> rien a payer ; pro-rata cote facturation).
    // Le compte facturation tenant ('tenant_owner') qui UPGRADE doit payer avant.
    const applyNow = input.requestedBy === 'ops_admin' || isDowngrade;

    const change = await prisma.planChange.create({
      data: {
        tenantId,
        fromPlanId: tenant.resourcePlanId,
        toPlanId: toPlan.id,
        status: applyNow ? 'active' : 'pending_payment',
        requestedBy: input.requestedBy,
        cpuLimitAtChange: toPlan.cpuLimit,
        memoryMbAtChange: toPlan.memoryMb,
        diskGbAtChange: toPlan.diskQuotaGb,
      },
    });

    if (applyNow) {
      // Applique en arriere-plan via un JOB tracke (logs visibles cote ops-admin
      // sur /tenants/:id/jobs/:jobId). On ne bloque pas la requete HTTP avec le
      // SSH + compose up (qui peut durer).
      const jobId = await this.startApplyJob(change.id);
      return { ...change, status: 'active', requiresPayment: false, jobId };
    }

    return { ...change, requiresPayment: true, plan: toPlan };
  }

  /**
   * Cree un ProvisioningJob (type PLAN_CHANGE) et lance l'application des
   * limites en arriere-plan, en streamant les logs dans le job. Retourne le
   * jobId immediatement pour que l'UI suive la progression.
   */
  async startApplyJob(planChangeId: string): Promise<string> {
    const change = await prisma.planChange.findUnique({
      where: { id: planChangeId },
      select: { tenantId: true, toPlan: { select: { code: true, name: true } } },
    });
    if (!change) throw new NotFoundError('PlanChange', planChangeId);

    const job = await prisma.provisioningJob.create({
      data: {
        tenantId: change.tenantId,
        type: 'PLAN_CHANGE',
        payload: { planChangeId },
        status: 'running',
        startedAt: new Date(),
      },
    });

    // Fire-and-forget : l'UI poll /tenants/:id/jobs/:jobId pour les logs.
    void (async () => {
      try {
        await this.jobLogger.append(job.id, `Changement de plan -> ${change.toPlan?.name ?? change.toPlan?.code ?? '?'}`);
        await this.applyPlanChange(planChangeId, (m) => {
          void this.jobLogger.append(job.id, m);
        });
        await this.jobLogger.append(job.id, 'Changement de plan applique avec succes.');
        await this.jobLogger.setStatus(job.id, 'succeeded');
      } catch (err) {
        await this.jobLogger.append(job.id, `ERREUR: ${(err as Error)?.message ?? String(err)}`);
        await this.jobLogger.setStatus(job.id, 'failed');
      }
    })();

    return job.id;
  }

  /**
   * Etape 2 : applique le changement (a appeler apres webhook payment ou manuellement).
   * - Update tenant.resourcePlanId
   * - Restart les containers avec les nouvelles limites
   */
  async applyPlanChange(planChangeId: string, log: (msg: string) => void = () => {}): Promise<void> {
    const change = await prisma.planChange.findUnique({
      where: { id: planChangeId },
      include: { toPlan: true, tenant: { include: { vps: true } } },
    });
    if (!change) throw new NotFoundError('PlanChange', planChangeId);
    if (change.status === 'active') return; // deja applique
    if (!change.tenant.vps) throw new BusinessError('Tenant sans VPS');

    const tenant = change.tenant;
    const plan = change.toPlan;
    log(`Plan cible: ${plan.name} (${plan.cpuLimit} CPU, ${plan.memoryMb} MB RAM, ${plan.diskQuotaGb} GB)`);

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

    // 2. Applique les nouvelles limites EN PATCHANT LE COMPOSE (si tenant ACTIVE).
    //
    // Le tenant tourne comme une stack docker compose (postgres/redis/minio/api/
    // web/web-client). On NE recree donc JAMAIS via `docker run` (cela cassait la
    // stack : volumes/network du projet compose perdus, services partiels). On
    // reecrit les `cpus:`/`mem_limit:` du fichier compose avec le MEME split que
    // le provisioning, puis `docker compose up -d` (recree uniquement les
    // services dont les limites changent, env_file/volumes conserves).
    if (tenant.status === 'ACTIVE') {
      const creds = {
        host: tenant.vps.host,
        port: tenant.vps.port,
        username: tenant.vps.username,
        sshKeyEncrypted: tenant.vps.sshKeyEncrypted,
      };
      const composeFile = `${config.tenantEnvDir}/tenant-${tenant.slug}-compose.yml`;
      const projectName = `tenant-${tenant.slug}`;
      log('Patch des limites cpus/mem_limit dans le compose...');

      // Repartition par service : source unique de verite partagee avec le
      // provisioning (cf computeServiceLimits).
      const svc = computeServiceLimits({ cpuLimit: plan.cpuLimit, memoryMb: plan.memoryMb });
      const apiMem = svc.api.memoryMb;
      const pgMem = svc.postgres.memoryMb;
      const webMem = svc.web.memoryMb;
      const wcMem = svc.webClient.memoryMb;
      const minioMem = svc.minio.memoryMb;
      const redisMem = svc.redis.memoryMb;
      const apiCpu = svc.api.cpu;
      const pgCpu = svc.postgres.cpu;
      const webCpu = svc.web.cpu;
      const wcCpu = svc.webClient.cpu;
      const minioCpu = svc.minio.cpu;
      const redisCpu = svc.redis.cpu;

      // awk : suit le service courant (cle YAML a 2 espaces) et reecrit ses
      // lignes cpus:/mem_limit:. Ordre web-client teste avant web (web: ne
      // matche pas web-client: car le ':' suit directement).
      const awk =
        `awk '` +
        `/^  postgres:/{s="pg"} /^  redis:/{s="redis"} /^  minio:/{s="minio"} ` +
        `/^  api:/{s="api"} /^  web-client:/{s="wc"} /^  web:/{s="web"} ` +
        `/^    cpus:/{` +
        `if(s=="pg")print "    cpus: ${pgCpu}";else if(s=="redis")print "    cpus: ${redisCpu}";` +
        `else if(s=="minio")print "    cpus: ${minioCpu}";else if(s=="api")print "    cpus: ${apiCpu}";` +
        `else if(s=="web")print "    cpus: ${webCpu}";else if(s=="wc")print "    cpus: ${wcCpu}";else print;next}` +
        `/^    mem_limit:/{` +
        `if(s=="pg")print "    mem_limit: ${pgMem}m";else if(s=="redis")print "    mem_limit: ${redisMem}m";` +
        `else if(s=="minio")print "    mem_limit: ${minioMem}m";else if(s=="api")print "    mem_limit: ${apiMem}m";` +
        `else if(s=="web")print "    mem_limit: ${webMem}m";else if(s=="wc")print "    mem_limit: ${wcMem}m";else print;next}` +
        `{print}' ${composeFile} > ${composeFile}.tmp && mv ${composeFile}.tmp ${composeFile}`;

      const patched = await this.ssh.exec(creds, awk);
      if (patched.code !== 0) {
        throw new BusinessError(`Patch des limites compose echoue : ${patched.stderr || patched.stdout}`);
      }
      log('Redeploiement docker compose up -d (recree les services dont les limites changent)...');
      await this.docker.composeUpExisting(creds, composeFile, projectName);
      log('Stack tenant redeployee avec les nouvelles limites.');
    } else {
      log(`Tenant non ACTIVE (${tenant.status}) : limites enregistrees, pas de redeploiement.`);
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
