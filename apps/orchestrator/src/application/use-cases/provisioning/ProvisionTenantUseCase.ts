import { inject, injectable } from 'tsyringe';
import { randomBytes } from 'crypto';
import { prisma } from '../../../config/database';
import { config } from '../../../config';
import { logger } from '../../../infrastructure/logger';
import { DockerService, DOCKER_SERVICE } from '../../../infrastructure/docker/DockerService';
import { CaddyService, CADDY_SERVICE, type TenantCaddyEntry } from '../../../infrastructure/caddy/CaddyService';
import { UFWService, UFW_SERVICE } from '../../../infrastructure/ufw/UFWService';
import { PortAllocator } from '../../../infrastructure/provisioning/PortAllocator';
import { SSHService, SSH_SERVICE, type SshConnection } from '../../../infrastructure/ssh/SSHService';
import { ProvisioningJobLogger } from './ProvisioningJobLogger';
import { CapacityService } from '../../services/CapacityService';
import { BusinessError, NotFoundError } from '../../../domain/errors/BusinessError';

const BASE_DOMAIN = process.env.OPS_BASE_DOMAIN ?? 'transitsoftservices.com';
const CADDY_EMAIL = process.env.OPS_CADDY_EMAIL ?? `admin@${BASE_DOMAIN}`;

/**
 * Worker de provisioning : SSH au VPS, cree la DB tenant, lance les conteneurs
 * (api + web), pousse la config Caddy, run prisma migrate + seed initial.
 *
 * Idempotent : peut etre rejoue si un step echoue (clean-up partiel + retry).
 */
@injectable()
export class ProvisionTenantUseCase {
  constructor(
    @inject(SSH_SERVICE) private ssh: SSHService,
    @inject(DOCKER_SERVICE) private docker: DockerService,
    @inject(CADDY_SERVICE) private caddy: CaddyService,
    @inject(UFW_SERVICE) private ufw: UFWService,
    private portAllocator: PortAllocator,
    private jobLogger: ProvisioningJobLogger,
    private capacity: CapacityService,
  ) {}

  async execute(tenantId: string, jobId: string): Promise<void> {
    const log = (msg: string) => this.jobLogger.append(jobId, msg);

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { vps: true },
    });
    if (!tenant) throw new NotFoundError('Tenant', tenantId);
    if (!tenant.vps) throw new BusinessError('Tenant sans VPS associe');
    // Le tenant principal est deja deploye via docker-compose.prod.yml sur le
    // VPS d'orchestration. On ne le (re-)provisionne pas, on l'inclut juste
    // dans la config Caddy via reconcileCaddy().
    if ((tenant as { isMain?: boolean }).isMain) {
      throw new BusinessError(
        'Tenant principal (isMain=true) : pas de provisioning. Utilisez /ops/caddy/reconcile pour rafraichir la config Caddy.',
      );
    }

    await log(`[provision] start tenant=${tenant.slug} vps=${tenant.vps.host}`);

    const creds: SshConnection = {
      host: tenant.vps.host,
      port: tenant.vps.port,
      username: tenant.vps.username,
      sshKeyEncrypted: tenant.vps.sshKeyEncrypted,
    };

    // 0. Verification capacite du VPS (Phase 4)
    const limits = await this.capacity.getTenantLimits(tenantId);
    await log(`[provision] limits : ${limits.cpuLimit} CPU, ${limits.memoryMb}MB RAM, ${limits.diskQuotaGb}GB disk (source=${limits.source})`);
    await this.capacity.assertCanAllocate(tenant.vpsId, limits, { excludeTenantId: tenantId });

    // 0.bis. Baseline UFW (idempotent) : 22/80/443 + enable.
    //
    // Pourquoi ici et pas a la creation du VPS :
    //  - le user "POST /ops/vps" ne fait pas tourner d'install scripts ; il
    //    enregistre juste les credentials SSH. Le 1er provisioning est le bon
    //    moment pour configurer le firewall.
    //  - idempotent : si la baseline est deja la, ufw allow re-pose les memes
    //    regles sans effet.
    //  - non-bloquant si echec (option : on log mais on continue) -- les
    //    admins peuvent rattraper depuis le dashboard ops-admin > UFW.
    if (process.env.OPS_SKIP_UFW_BASELINE !== 'true') {
      try {
        await log('[provision] applyBaseline UFW (allow 22/80/443 + enable)');
        const r = await this.ufw.applyBaseline(creds);
        if (!r.ok) {
          await log(`[provision] WARN UFW baseline partielle : ${r.messages.join(' | ')}`);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        await log(`[provision] WARN UFW baseline ignoree : ${msg}`);
      }
    } else {
      await log('[provision] UFW baseline skippee (OPS_SKIP_UFW_BASELINE=true)');
    }

    // 1. Allocation des ports (idempotent : on garde ceux deja attribues)
    let apiPort = tenant.apiPort ?? 0;
    let webPort = tenant.webPort ?? 0;
    let webClientPort = tenant.webClientPort ?? 0;
    if (!apiPort || !webPort || !webClientPort) {
      const allocated = await this.portAllocator.allocate(tenant.vpsId);
      apiPort = apiPort || allocated.apiPort;
      webPort = webPort || allocated.webPort;
      webClientPort = webClientPort || allocated.webClientPort;
      await prisma.tenant.update({
        where: { id: tenantId },
        data: { apiPort, webPort, webClientPort },
      });
      await log(`[provision] ports alloues api=${apiPort} web=${webPort} web-client=${webClientPort}`);
    } else {
      await log(`[provision] ports existants reutilises api=${apiPort} web=${webPort} web-client=${webClientPort}`);
    }

    // 2. Pull des images depuis GHCR (api + web staff + web-client public)
    if (config.ghcr.pullToken) {
      await log('[provision] docker login ghcr.io');
      await this.docker.loginGhcr(creds, config.ghcr.namespace, config.ghcr.pullToken);
    }
    const apiImage = `ghcr.io/${config.ghcr.namespace}/optipack-api:latest`;
    const webImage = `ghcr.io/${config.ghcr.namespace}/optipack-web:latest`;
    const webClientImage = `ghcr.io/${config.ghcr.namespace}/optipack-web-client:latest`;
    await log(`[provision] docker pull ${apiImage}`);
    await this.docker.pull(creds, apiImage);
    await log(`[provision] docker pull ${webImage}`);
    await this.docker.pull(creds, webImage);
    await log(`[provision] docker pull ${webClientImage}`);
    await this.docker.pull(creds, webClientImage);

    // 3. Creer la BDD tenant si elle n'existe pas (commande psql via postgres container ou socket)
    //    On part du principe qu'un container `postgres` tourne sur le VPS (cf. setup VPS doc).
    const dbName = tenant.dbName ?? `tenant_${tenant.slug.replace(/-/g, '_')}_db`;
    await log(`[provision] CREATE DATABASE ${dbName} (si manquant)`);
    const createDbResult = await this.ssh.exec(
      creds,
      `docker exec postgres psql -U \${POSTGRES_USER:-postgres} -tc "SELECT 1 FROM pg_database WHERE datname='${dbName}'" | grep -q 1 || docker exec postgres psql -U \${POSTGRES_USER:-postgres} -c 'CREATE DATABASE "${dbName}"'`,
    );
    if (createDbResult.code !== 0) {
      await log(`[provision] WARN createdb : ${createDbResult.stderr}`);
    }

    // 4. Generer le .env du tenant
    const jwtSecret = randomBytes(32).toString('hex');
    const authSecret = randomBytes(32).toString('hex');
    const envFile = `/etc/optipack/tenant-${tenant.slug}.env`;
    const envContent = [
      `NODE_ENV=production`,
      `TENANT_SLUG=${tenant.slug}`,
      `DATABASE_URL=postgresql://\${POSTGRES_USER:-postgres}:\${POSTGRES_PASSWORD}@postgres:5432/${dbName}?schema=public`,
      `REDIS_URL=redis://redis:6379`,
      `JWT_SECRET=${jwtSecret}`,
      `AUTH_SECRET=${authSecret}`,
      `JWT_ACCESS_EXPIRY=15m`,
      `JWT_REFRESH_EXPIRY=7d`,
      `MINIO_ENDPOINT=minio`,
      `MINIO_PORT=9000`,
      `MINIO_BUCKET=tenant-${tenant.slug}`,
      `MINIO_ROOT_USER=\${MINIO_ROOT_USER}`,
      `MINIO_ROOT_PASSWORD=\${MINIO_ROOT_PASSWORD}`,
      `API_PORT=4000`,
      `NEXT_PUBLIC_API_URL=https://api.${tenant.slug}.${BASE_DOMAIN}/api/v1`,
      `PUBLIC_TRACKING_URL=https://${tenant.slug}.${BASE_DOMAIN}`,
    ].join('\n');

    await log(`[provision] write env file ${envFile}`);
    await this.ssh.exec(
      creds,
      `mkdir -p /etc/optipack && cat > ${envFile} <<'EOF'\n${envContent}\nEOF\nchmod 600 ${envFile}`,
    );

    // 5. Stop + remove les anciens containers s'ils existent (rejouabilite)
    const apiName = `tenant-${tenant.slug}-api`;
    const webName = `tenant-${tenant.slug}-web`;
    const webClientName = `tenant-${tenant.slug}-web-client`;
    await log(`[provision] cleanup anciens containers (rejouabilite)`);
    await this.docker.remove(creds, apiName, true);
    await this.docker.remove(creds, webName, true);
    await this.docker.remove(creds, webClientName, true);

    // 6. Run le container API avec limites de ressources (Phase 4)
    // Split RAM 50/25/25 entre api, web staff et web-client public. CPU partage.
    const apiMemoryMb = Math.floor(limits.memoryMb * 0.5);
    const webMemoryMb = Math.floor(limits.memoryMb * 0.25);
    const webClientMemoryMb = limits.memoryMb - apiMemoryMb - webMemoryMb;
    const thirdCpu = limits.cpuLimit / 3;
    const halfCpu = limits.cpuLimit / 2; // conserve la variable pour minimiser le diff sur d'autres references eventuelles
    void halfCpu;
    await log(`[provision] docker run ${apiName} (cpus=${thirdCpu.toFixed(2)} mem=${Math.round(apiMemoryMb)}MB)`);
    await this.docker.run(creds, {
      name: apiName,
      image: apiImage,
      ports: { [apiPort]: 4000 },
      envFile,
      restart: 'unless-stopped',
      network: 'optipack-shared',
      cpuLimit: Number(thirdCpu.toFixed(2)),
      memoryMb: Math.round(apiMemoryMb),
    });

    // 7. Run prisma migrate deploy dans le container
    await log(`[provision] prisma migrate deploy`);
    const migrateResult = await this.docker.exec(creds, apiName, 'pnpm prisma migrate deploy');
    if (migrateResult.code !== 0) {
      await log(`[provision] WARN migrate : ${migrateResult.stderr}`);
    }

    // 8. Seed initial : creer Organization + admin user
    await log(`[provision] seed initial Organization + admin owner`);
    const seedScript = `
      node -e "
        const { PrismaClient } = require('@prisma/client');
        const bcrypt = require('bcryptjs');
        const p = new PrismaClient();
        (async () => {
          const orgId = '${tenant.id}';
          const existing = await p.organization.findUnique({ where: { id: orgId } });
          if (!existing) {
            await p.organization.create({
              data: {
                id: orgId,
                name: ${JSON.stringify(tenant.name)},
                slug: ${JSON.stringify(tenant.slug)},
                logoUrl: ${JSON.stringify(tenant.logoUrl)},
                primaryColor: ${JSON.stringify(tenant.primaryColor)},
                secondaryColor: ${JSON.stringify(tenant.secondaryColor)},
                accentColor: ${JSON.stringify(tenant.accentColor)},
                enabledModules: ${JSON.stringify(tenant.enabledModules)},
                supportEmail: ${JSON.stringify(tenant.ownerEmail)},
              },
            });
            const hash = await bcrypt.hash('changeme', 10);
            await p.user.create({
              data: {
                organizationId: orgId,
                email: ${JSON.stringify(tenant.ownerEmail)},
                passwordHash: hash,
                firstName: ${JSON.stringify(tenant.ownerUsername)},
                lastName: 'Owner',
                role: 'SUPER_ADMIN',
                isActive: true,
                isVerified: true,
              },
            });
          }
          await p.\\\$disconnect();
        })();
      "
    `.trim();
    const seedResult = await this.docker.exec(creds, apiName, `sh -c "${seedScript.replace(/"/g, '\\"')}"`);
    if (seedResult.code !== 0) {
      await log(`[provision] WARN seed : ${seedResult.stderr}`);
    }

    // 9. Run le container Web staff avec sa part de ressources
    await log(`[provision] docker run ${webName} (cpus=${thirdCpu.toFixed(2)} mem=${Math.round(webMemoryMb)}MB)`);
    await this.docker.run(creds, {
      name: webName,
      image: webImage,
      ports: { [webPort]: 3000 },
      env: {
        TENANT_SLUG: tenant.slug,
        NEXT_PUBLIC_API_URL: `https://api.${tenant.slug}.${BASE_DOMAIN}/api/v1`,
      },
      restart: 'unless-stopped',
      network: 'optipack-shared',
      cpuLimit: Number(thirdCpu.toFixed(2)),
      memoryMb: Math.round(webMemoryMb),
    });

    // 9.bis. Run le container Web-Client (site public + portail client)
    await log(`[provision] docker run ${webClientName} (cpus=${thirdCpu.toFixed(2)} mem=${Math.round(webClientMemoryMb)}MB)`);
    await this.docker.run(creds, {
      name: webClientName,
      image: webClientImage,
      ports: { [webClientPort]: 3001 },
      env: {
        TENANT_SLUG: tenant.slug,
        NEXT_PUBLIC_API_URL: `https://api.${tenant.slug}.${BASE_DOMAIN}/api/v1`,
        NEXT_PUBLIC_TENANT_SLUG: tenant.slug,
      },
      restart: 'unless-stopped',
      network: 'optipack-shared',
      cpuLimit: Number(thirdCpu.toFixed(2)),
      memoryMb: Math.round(webClientMemoryMb),
    });

    // 10. Update Caddy config (full replace) avec tous les tenants ACTIVE/PROVISIONING de ce VPS
    await log(`[provision] reload Caddy config`);
    const allTenants = await prisma.tenant.findMany({
      where: { vpsId: tenant.vpsId, status: { in: ['ACTIVE', 'PROVISIONING'] } },
    });
    const caddyEntries: TenantCaddyEntry[] = allTenants
      .filter((t) => t.apiPort && t.webPort)
      .map((t) => ({
        slug: t.slug,
        customDomain: t.customDomain,
        apiPort: t.apiPort!,
        webPort: t.webPort!,
        webClientPort: t.webClientPort ?? undefined,
        isFrozen: false,
        isMain: (t as { isMain?: boolean }).isMain ?? false,
      }));
    // Inclure le tenant courant meme s'il n'est pas encore ACTIVE
    if (!caddyEntries.find((e) => e.slug === tenant.slug)) {
      caddyEntries.push({
        slug: tenant.slug,
        customDomain: tenant.customDomain,
        apiPort,
        webPort,
        webClientPort,
        isFrozen: false,
      });
    }
    await this.caddy.push(creds, this.caddy.buildConfig(caddyEntries, { baseDomain: BASE_DOMAIN, email: CADDY_EMAIL }));

    // 11. Health check API
    await log(`[provision] health check api`);
    const apiOk = await this.docker.healthCheck(creds, apiPort, '/api/v1/tenant-meta', 90);
    if (!apiOk) {
      throw new Error('API tenant ne repond pas apres provisioning (health check timeout)');
    }

    // 12. Update tenant status = ACTIVE
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { status: 'ACTIVE', currentVersion: 'latest' },
    });
    await log(`[provision] DONE tenant=${tenant.slug} ACTIVE`);
    logger.info({ tenantId, slug: tenant.slug }, '[provision] tenant ready');
  }
}
