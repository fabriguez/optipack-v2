import { inject, injectable } from 'tsyringe';
import { randomBytes } from 'crypto';
import { prisma } from '../../../config/database';
import { config } from '../../../config';
import { logger } from '../../../infrastructure/logger';
import { DockerService, DOCKER_SERVICE } from '../../../infrastructure/docker/DockerService';
import {
  CaddyService,
  CADDY_SERVICE,
  type TenantCaddyEntry,
} from '../../../infrastructure/caddy/CaddyService';
import { UFWService, UFW_SERVICE } from '../../../infrastructure/ufw/UFWService';
import { PortAllocator } from '../../../infrastructure/provisioning/PortAllocator';
import {
  SSHService,
  SSH_SERVICE,
  type SshConnection,
} from '../../../infrastructure/ssh/SSHService';
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
    await log(
      `[provision] limits : ${limits.cpuLimit} CPU, ${limits.memoryMb}MB RAM, ${limits.diskQuotaGb}GB disk (source=${limits.source})`,
    );
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
      await log(
        `[provision] ports alloues api=${apiPort} web=${webPort} web-client=${webClientPort}`,
      );
    } else {
      await log(
        `[provision] ports existants reutilises api=${apiPort} web=${webPort} web-client=${webClientPort}`,
      );
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

    // 3. Creer la BDD tenant si elle n'existe pas. On essaye plusieurs noms
    //    de container postgres connus + un fallback par filtre image, puis on
    //    bascule sur psql distant si rien ne marche. Avant, le nom etait
    //    hardcode "postgres" -> "No such container: postgres" sur tous les
    //    VPS ou le container est nomme autrement (optipack-postgres, etc).
    const dbName = tenant.dbName ?? `tenant_${tenant.slug.replace(/-/g, '_')}_db`;
    await log(`[provision] CREATE DATABASE ${dbName} (si manquant)`);
    const pgContainerCandidates = [
      process.env.OPS_POSTGRES_CONTAINER,
      'optipack-postgres',
      'postgres',
      'pg',
    ].filter(Boolean) as string[];
    // Detecte le container postgres en tournant une fois, puis cree la DB.
    const detectAndCreate = `
      set -e
      PG_CTR=""
      for name in ${pgContainerCandidates.map((c) => `"${c}"`).join(' ')}; do
        if docker ps --format '{{.Names}}' | grep -qx "$name"; then PG_CTR="$name"; break; fi
      done
      if [ -z "$PG_CTR" ]; then
        # Fallback : chercher un container dont l'image commence par "postgres".
        PG_CTR=$(docker ps --filter "ancestor=postgres" --format '{{.Names}}' | head -n 1)
      fi
      if [ -z "$PG_CTR" ]; then
        echo "ERR no postgres container found" >&2
        exit 1
      fi
      docker exec -e PGPASSWORD="\${POSTGRES_PASSWORD:-}" "$PG_CTR" \
        psql -U "\${POSTGRES_USER:-postgres}" -tc \
        "SELECT 1 FROM pg_database WHERE datname='${dbName}'" | grep -q 1 || \
      docker exec -e PGPASSWORD="\${POSTGRES_PASSWORD:-}" "$PG_CTR" \
        psql -U "\${POSTGRES_USER:-postgres}" -c 'CREATE DATABASE "${dbName}"'
    `;
    const createDbResult = await this.ssh.exec(creds, detectAndCreate);
    if (createDbResult.code !== 0) {
      await log(`[provision] WARN createdb : ${(createDbResult.stderr || createDbResult.stdout || '').trim()}`);
    }

    // 4. Generer le .env du tenant
    const jwtSecret = randomBytes(32).toString('hex');
    const authSecret = randomBytes(32).toString('hex');
    const envFile = `${config.tenantEnvDir}/tenant-${tenant.slug}.env`;
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
    const envWriteResult = await this.ssh.exec(
      creds,
      `mkdir -p ${config.tenantEnvDir} && cat > ${envFile} <<'EOF'\n${envContent}\nEOF\nchmod 600 ${envFile}`,
    );
    if (envWriteResult.code !== 0) {
      throw new Error(`ecriture du fichier env ${envFile} echoue : ${envWriteResult.stderr || envWriteResult.stdout}`);
    }

    // 5. Stop + remove les anciens containers s'ils existent (rejouabilite)
    const apiName = `tenant-${tenant.slug}-api`;
    const webName = `tenant-${tenant.slug}-web`;
    const webClientName = `tenant-${tenant.slug}-web-client`;
    await log(`[provision] cleanup anciens containers (rejouabilite)`);
    await this.docker.remove(creds, apiName, true);
    await this.docker.remove(creds, webName, true);
    await this.docker.remove(creds, webClientName, true);

    // 6. Run les containers tenant via docker compose
    // Split RAM 50/25/25 entre api, web staff et web-client public. CPU partage.
    const apiMemoryMb = Math.floor(limits.memoryMb * 0.5);
    const webMemoryMb = Math.floor(limits.memoryMb * 0.25);
    const webClientMemoryMb = limits.memoryMb - apiMemoryMb - webMemoryMb;
    const thirdCpu = Number((limits.cpuLimit / 3).toFixed(3));
    const composeFile = `/tmp/tenant-${tenant.slug}-compose.yml`;
    const composeProject = `tenant-${tenant.slug}`;
    const composeYaml = `version: "3.9"
services:
  api:
    container_name: ${apiName}
    image: ${apiImage}
    env_file:
      - ${envFile}
    ports:
      - "127.0.0.1:${apiPort}:4000"
    restart: unless-stopped
    networks:
      - optipack-shared
    cpus: ${thirdCpu}
    mem_limit: ${apiMemoryMb}m
  web:
    container_name: ${webName}
    image: ${webImage}
    env_file:
      - ${envFile}
    environment:
      TENANT_SLUG: ${JSON.stringify(tenant.slug)}
      NEXT_PUBLIC_API_URL: ${JSON.stringify(`https://api.${tenant.slug}.${BASE_DOMAIN}/api/v1`)}
    ports:
      - "127.0.0.1:${webPort}:3000"
    restart: unless-stopped
    networks:
      - optipack-shared
    cpus: ${thirdCpu}
    mem_limit: ${webMemoryMb}m
  web-client:
    container_name: ${webClientName}
    image: ${webClientImage}
    env_file:
      - ${envFile}
    environment:
      TENANT_SLUG: ${JSON.stringify(tenant.slug)}
      NEXT_PUBLIC_API_URL: ${JSON.stringify(`https://api.${tenant.slug}.${BASE_DOMAIN}/api/v1`)}
      NEXT_PUBLIC_TENANT_SLUG: ${JSON.stringify(tenant.slug)}
    ports:
      - "127.0.0.1:${webClientPort}:3001"
    restart: unless-stopped
    networks:
      - optipack-shared
    cpus: ${thirdCpu}
    mem_limit: ${webClientMemoryMb}m
networks:
  optipack-shared:
    external: true
`;

    await log(`[provision] docker compose up tenant ${tenant.slug}`);
    await this.ssh.exec(
      creds,
      'docker network inspect optipack-shared >/dev/null 2>&1 || docker network create optipack-shared',
    );
    await this.docker.composeUp(creds, composeFile, composeYaml, composeProject);

    // 7. Run prisma migrate deploy dans le container.
    //
    // L'image API n'a pas forcement pnpm (build prod = node only). On essaye
    // `npx prisma` puis `node_modules/.bin/prisma` puis `pnpm prisma` en
    // fallback. Avant, le warn ne montrait que stderr -> message vide quand
    // l'echec etait dans stdout (ex: "pnpm: command not found").
    await log(`[provision] prisma migrate deploy`);
    const migrateCmd = "sh -c 'cd /app/apps/api 2>/dev/null || cd /app; if command -v prisma >/dev/null 2>&1; then prisma migrate deploy --schema=./prisma/schema.prisma; elif [ -x ./node_modules/.bin/prisma ]; then ./node_modules/.bin/prisma migrate deploy --schema=./prisma/schema.prisma; elif command -v npx >/dev/null 2>&1; then npx -y prisma migrate deploy --schema=./prisma/schema.prisma; elif command -v pnpm >/dev/null 2>&1; then pnpm prisma migrate deploy; else echo \"ERR: prisma CLI introuvable\" >&2; exit 1; fi'";
    const migrateResult = await this.docker.exec(creds, apiName, migrateCmd);
    if (migrateResult.code !== 0) {
      const detail = [migrateResult.stderr, migrateResult.stdout].filter(Boolean).join(' | ').trim();
      await log(`[provision] WARN migrate (code=${migrateResult.code}) : ${detail || '(no output)'}`);
    }

    // 8. Seed initial : creer Organization + admin user.
    //
    // L'ancienne version utilisait `sh -c "node -e \"...\""` avec des couches
    // d'echappement imbriquees qui cassaient des que le payload contenait un
    // `#` (couleurs primaryColor) ou des guillemets. Resultat : `primaryColor:
    // #1B5E20,` non quote, SyntaxError au parse Node. Solution propre : on
    // ecrit le script dans /tmp via heredoc puis on l'execute -- plus aucun
    // probleme d'echappement.
    await log(`[provision] seed initial Organization + admin owner`);
    const seedPayload = {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      logoUrl: tenant.logoUrl ?? null,
      primaryColor: tenant.primaryColor ?? '#1B5E20',
      secondaryColor: tenant.secondaryColor ?? '#4CAF50',
      accentColor: tenant.accentColor ?? '#E8F5E9',
      enabledModules: tenant.enabledModules ?? [],
      supportEmail: tenant.ownerEmail ?? null,
      ownerEmail: tenant.ownerEmail,
      ownerUsername: tenant.ownerUsername ?? 'admin',
    };
    // Le script lit le JSON via process.env.SEED_DATA -- plus de pollution du
    // shell par le contenu utilisateur (couleurs, names, emails).
    const seedScript = `
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const data = JSON.parse(process.env.SEED_DATA || '{}');
const p = new PrismaClient();
(async () => {
  const existing = await p.organization.findUnique({ where: { id: data.id } });
  if (!existing) {
    await p.organization.create({
      data: {
        id: data.id,
        name: data.name,
        slug: data.slug,
        logoUrl: data.logoUrl,
        primaryColor: data.primaryColor,
        secondaryColor: data.secondaryColor,
        accentColor: data.accentColor,
        enabledModules: data.enabledModules,
        supportEmail: data.supportEmail,
      },
    });
    const hash = await bcrypt.hash('changeme', 10);
    await p.user.create({
      data: {
        organizationId: data.id,
        email: data.ownerEmail,
        passwordHash: hash,
        firstName: data.ownerUsername,
        lastName: 'Owner',
        role: 'SUPER_ADMIN',
        isActive: true,
        isVerified: true,
      },
    });
  }
  await p.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
`;
    // On ecrit le script + le payload JSON sur le HOST via heredoc quote
    // ('SEED_EOF' avec quotes -> aucune expansion shell), puis on docker cp
    // dans le container, puis on exec node. Aucun escape a faire : tout
    // contenu utilisateur reste litteral.
    const tmpScript = `/tmp/seed-${tenant.slug}.js`;
    const tmpData = `/tmp/seed-${tenant.slug}.json`;
    const sshSeedCmd = `set -e
cat > ${tmpScript} <<'OPTIPACK_SEED_SCRIPT_EOF'
${seedScript}
OPTIPACK_SEED_SCRIPT_EOF
cat > ${tmpData} <<'OPTIPACK_SEED_DATA_EOF'
${JSON.stringify(seedPayload)}
OPTIPACK_SEED_DATA_EOF
docker cp ${tmpScript} ${apiName}:/tmp/seed.js
docker cp ${tmpData} ${apiName}:/tmp/seed.json
docker exec -e SEED_DATA="$(cat ${tmpData})" ${apiName} node /tmp/seed.js
rm -f ${tmpScript} ${tmpData}
`;
    const seedResult = await this.ssh.exec(creds, sshSeedCmd);
    if (seedResult.code !== 0) {
      await log(`[provision] WARN seed : ${(seedResult.stderr || seedResult.stdout || '').trim()}`);
    }

    // 9. (supprime) -- web et web-client sont deja demarres par
    // `docker compose up` a l'etape 6. Les docker run supplementaires
    // produisaient "Conflict. The container name /tenant-test-web is
    // already in use" et faisaient echouer le provisioning a chaque essai.
    // Compose gere lui-meme : container_name, ports, env, cpus, mem_limit.

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
    await this.caddy.push(
      creds,
      this.caddy.buildConfig(caddyEntries, { baseDomain: BASE_DOMAIN, email: CADDY_EMAIL }),
    );

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
