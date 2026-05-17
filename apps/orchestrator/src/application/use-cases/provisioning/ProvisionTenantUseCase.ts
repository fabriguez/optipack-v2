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

    // 0.bis. Pre-flight SSH : on teste la connexion AVANT d'allouer ports,
    // pull images, etc. Si le VPS n'est pas joignable (cle absente,
    // placeholder, sshd down), on stoppe net avec un message actionnable.
    // Specifique self : on suggere l'action /vps/:id/setup-self-ssh.
    await log(`[provision] preflight SSH ${tenant.vps.username}@${tenant.vps.host}:${tenant.vps.port}`);
    const sshTest = await this.ssh.testConnection(creds);
    if (!sshTest.ok) {
      const isSelf =
        tenant.vps.host === '127.0.0.1' ||
        tenant.vps.host === 'localhost' ||
        tenant.vps.host === '::1';
      const hint = isSelf
        ? `Self : configure d'abord SSH via POST /ops/vps/${tenant.vps.id}/setup-self-ssh (ou bouton "Configurer SSH" dans l'UI VPS).`
        : `Distant : verifie la cle SSH (PATCH /ops/vps/${tenant.vps.id} -> sshPrivateKey) et que sshd accepte ${tenant.vps.username}.`;
      throw new BusinessError(
        `Pre-flight SSH echoue (${tenant.vps.host}) : ${sshTest.message ?? 'inconnu'}. ${hint}`,
      );
    }
    await log(`[provision] preflight SSH OK`);

    // Garantit l'existence du dir de travail (compose/env/seed). Idempotent.
    await this.ssh.exec(creds, `mkdir -p ${config.vpsWorkDir}`).catch(() => {/* noop */});

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

    // 3. (supprime) -- chaque tenant a maintenant son propre container
    //    postgres dans son stack compose. Pas de "CREATE DATABASE" externe :
    //    POSTGRES_DB env initialise la base au premier boot du container.
    const dbName = tenant.dbName ?? `tenant_${tenant.slug.replace(/-/g, '_')}_db`;

    // 4. Generer credentials uniques + .env du tenant.
    //
    // Stack isolee par tenant : chaque tenant possede ses propres containers
    // postgres + redis + minio. Les credentials sont generees aleatoirement
    // une fois ici, persistees dans /etc/optipack/tenant-<slug>.env et
    // partagees uniquement avec les services internes du compose (api +
    // postgres + minio se voient via le network compose).
    const envFile = `${config.tenantEnvDir}/tenant-${tenant.slug}.env`;
    // Re-provisioning : on relit le .env existant pour reutiliser les memes
    // credentials (sinon le volume postgres persistant garde l'ancien user/
    // pass et l'API n'arrive plus a se connecter). Si le fichier n'existe
    // pas (premier provision), on genere de nouvelles valeurs aleatoires.
    const existingEnv = await this.readExistingEnv(creds, envFile);
    const jwtSecret = existingEnv?.JWT_SECRET || randomBytes(32).toString('hex');
    const authSecret = existingEnv?.AUTH_SECRET || randomBytes(32).toString('hex');
    const pgUser = existingEnv?.POSTGRES_USER || `tenant_${tenant.slug.replace(/-/g, '_')}`;
    const pgPass = existingEnv?.POSTGRES_PASSWORD || randomBytes(24).toString('hex');
    const minioUser = existingEnv?.MINIO_ROOT_USER || `tenant_${tenant.slug.replace(/-/g, '_')}`;
    const minioPass = existingEnv?.MINIO_ROOT_PASSWORD || randomBytes(24).toString('hex');
    const minioBucket = `tenant-${tenant.slug}`;
    // Les noms de services compose = noms DNS au sein du network compose.
    // L'API tenant s'y connecte directement (pas de port host expose pour
    // postgres/redis/minio).
    const envContent = [
      `NODE_ENV=production`,
      `TENANT_SLUG=${tenant.slug}`,
      `DATABASE_URL=postgresql://${pgUser}:${pgPass}@postgres:5432/${dbName}?schema=public`,
      `REDIS_URL=redis://redis:6379`,
      `JWT_SECRET=${jwtSecret}`,
      `AUTH_SECRET=${authSecret}`,
      `JWT_ACCESS_EXPIRY=15m`,
      `JWT_REFRESH_EXPIRY=7d`,
      `MINIO_ENDPOINT=minio`,
      `MINIO_PORT=9000`,
      `MINIO_BUCKET=${minioBucket}`,
      `MINIO_ROOT_USER=${minioUser}`,
      `MINIO_ROOT_PASSWORD=${minioPass}`,
      `MINIO_ACCESS_KEY=${minioUser}`,
      `MINIO_SECRET_KEY=${minioPass}`,
      `POSTGRES_USER=${pgUser}`,
      `POSTGRES_PASSWORD=${pgPass}`,
      `POSTGRES_DB=${dbName}`,
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

    // 5. Stop + remove les anciens containers s'ils existent (rejouabilite).
    //
    // Bug fixe : avant on faisait juste `docker rm -f tenant-<slug>-(api|web|
    // web-client)`. Mais le compose project pouvait garder des refs / ports
    // reserves -> "port is already allocated" au prochain compose up.
    // Solution : compose down --remove-orphans -t 5 -v pour reset complet,
    // PUIS rm -f par nom comme garde-fou (au cas ou le compose file aurait
    // change de nom de container entre essais).
    const apiName = `tenant-${tenant.slug}-api`;
    const webName = `tenant-${tenant.slug}-web`;
    const webClientName = `tenant-${tenant.slug}-web-client`;
    const composeFilePath = `${config.vpsWorkDir}/tenant-${tenant.slug}-compose.yml`;
    const composeProjectName = `tenant-${tenant.slug}`;
    await log(`[provision] cleanup anciens containers (rejouabilite)`);
    await this.ssh.exec(
      creds,
      `docker compose -p ${composeProjectName} -f ${composeFilePath} down --remove-orphans -t 5 -v 2>/dev/null || true`,
    );
    await this.docker.remove(creds, apiName, true);
    await this.docker.remove(creds, webName, true);
    await this.docker.remove(creds, webClientName, true);

    // 6. Stack docker compose isole par tenant : postgres + redis + minio +
    // api + web + web-client. Aucun service partage entre tenants. Les
    // services postgres/redis/minio ne sont PAS exposes sur le host (pas de
    // ports:) -- l'API tenant s'y connecte via le network interne du
    // compose.
    //
    // Repartition CPU/RAM sur 6 services (split tres approximatif --
    // postgres + api sont les plus gourmands) :
    //   api          : 30% RAM, 1/3 CPU
    //   postgres     : 25% RAM, 1/4 CPU
    //   web          : 15% RAM, 1/8 CPU
    //   web-client   : 15% RAM, 1/8 CPU
    //   minio        : 10% RAM, 1/12 CPU
    //   redis        :  5% RAM, 1/16 CPU
    const apiMemoryMb = Math.floor(limits.memoryMb * 0.30);
    const pgMemoryMb = Math.floor(limits.memoryMb * 0.25);
    const webMemoryMb = Math.floor(limits.memoryMb * 0.15);
    const webClientMemoryMb = Math.floor(limits.memoryMb * 0.15);
    const minioMemoryMb = Math.floor(limits.memoryMb * 0.10);
    const redisMemoryMb = Math.max(64, limits.memoryMb - apiMemoryMb - pgMemoryMb - webMemoryMb - webClientMemoryMb - minioMemoryMb);
    const apiCpu = Number((limits.cpuLimit / 3).toFixed(3));
    const pgCpu = Number((limits.cpuLimit / 4).toFixed(3));
    const webCpu = Number((limits.cpuLimit / 8).toFixed(3));
    const webClientCpu = Number((limits.cpuLimit / 8).toFixed(3));
    const minioCpu = Number((limits.cpuLimit / 12).toFixed(3));
    const redisCpu = Number(Math.max(0.05, limits.cpuLimit / 16).toFixed(3));

    const pgName = `tenant-${tenant.slug}-postgres`;
    const redisName = `tenant-${tenant.slug}-redis`;
    const minioName = `tenant-${tenant.slug}-minio`;
    const networkName = `tenant-${tenant.slug}-net`;
    // (composeFilePath / composeProjectName deja declares lors du cleanup
    // a l'etape 5). On reutilise les memes valeurs.
    const composeYaml = `services:
  postgres:
    container_name: ${pgName}
    image: postgres:16-alpine
    env_file:
      - ${envFile}
    volumes:
      - pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    networks:
      - tenant
    cpus: ${pgCpu}
    mem_limit: ${pgMemoryMb}m
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $$POSTGRES_USER -d $$POSTGRES_DB"]
      interval: 5s
      timeout: 5s
      retries: 20
  redis:
    container_name: ${redisName}
    image: redis:7-alpine
    command: ["redis-server", "--save", "60", "1", "--loglevel", "warning"]
    volumes:
      - redisdata:/data
    restart: unless-stopped
    networks:
      - tenant
    cpus: ${redisCpu}
    mem_limit: ${redisMemoryMb}m
  minio:
    container_name: ${minioName}
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    env_file:
      - ${envFile}
    volumes:
      - miniodata:/data
    restart: unless-stopped
    networks:
      - tenant
    cpus: ${minioCpu}
    mem_limit: ${minioMemoryMb}m
  api:
    container_name: ${apiName}
    image: ${apiImage}
    env_file:
      - ${envFile}
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started
      minio:
        condition: service_started
    ports:
      - "127.0.0.1:${apiPort}:4000"
    restart: unless-stopped
    networks:
      - tenant
    cpus: ${apiCpu}
    mem_limit: ${apiMemoryMb}m
  web:
    container_name: ${webName}
    image: ${webImage}
    env_file:
      - ${envFile}
    environment:
      TENANT_SLUG: ${JSON.stringify(tenant.slug)}
      NEXT_PUBLIC_API_URL: ${JSON.stringify(`https://api.${tenant.slug}.${BASE_DOMAIN}/api/v1`)}
      # NextAuth v5 multi-tenant : Caddy forward le host public, container
      # ne le connait pas a build time -> trust X-Forwarded-Host du proxy.
      AUTH_TRUST_HOST: "true"
      AUTH_URL: ${JSON.stringify(`https://app.${tenant.slug}.${BASE_DOMAIN}`)}
    ports:
      - "127.0.0.1:${webPort}:3000"
    restart: unless-stopped
    networks:
      - tenant
    cpus: ${webCpu}
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
      - tenant
    cpus: ${webClientCpu}
    mem_limit: ${webClientMemoryMb}m
networks:
  tenant:
    name: ${networkName}
volumes:
  pgdata:
    name: tenant-${tenant.slug}-pgdata
  redisdata:
    name: tenant-${tenant.slug}-redisdata
  miniodata:
    name: tenant-${tenant.slug}-miniodata
`;

    // Libere les ports planifies : un container zombie d'un AUTRE tenant
    // (ex: provisioning precedent qui a echoue et reste accroche) peut
    // encore binder le port host -> "port is already allocated". On scanne
    // tous les containers par leur mapping de ports (parsing de Ports column),
    // car `--filter publish=PORT` matche imparfaitement les bindings 127.0.0.1.
    // Puis fallback fuser pour killer tout process host non-docker.
    await log(`[provision] free ports ${apiPort}/${webPort}/${webClientPort} (force-kill containers occupants)`);
    const ports = [apiPort, webPort, webClientPort];
    const freePortsCmd = `set -e
for p in ${ports.join(' ')}; do
  # 1) containers docker qui mappent ce port (toute IP)
  for c in $(docker ps -a --format '{{.ID}}|{{.Ports}}' 2>/dev/null | awk -F'|' -v p=":$p->" '$2 ~ p {print $1}'); do
    docker rm -f "$c" >/dev/null 2>&1 || true
  done
  # 2) fallback : tout process host qui ecoute sur ce port (rare mais possible)
  fuser -k -n tcp "$p" >/dev/null 2>&1 || true
done
true`;
    await this.ssh.exec(creds, freePortsCmd);

    await log(`[provision] docker compose up tenant ${tenant.slug}`);
    // Le network est cree par compose (declaration `networks:` dans le YAML),
    // pas besoin de pre-creation. La stack est entierement isolee.
    await this.docker.composeUp(creds, composeFilePath, composeYaml, composeProjectName);

    // 7. Sync schema BDD dans le container API.
    //
    // L'API ne contient pas de dossier prisma/migrations (developpe via
    // `db push` pendant le bootstrap). Du coup `prisma migrate deploy` ne
    // fait rien -> tables jamais creees -> seed echoue P2021
    // "public.organizations does not exist".
    //
    // On lance d'abord `migrate deploy` (no-op si pas de migrations) PUIS
    // `db push --accept-data-loss=false` qui synchronise schema.prisma avec
    // la DB. db push est idempotent : si tout est deja en place, no-op.
    //
    // Override possible : OPS_TENANT_DB_SYNC=migrate -> skip db push (pour
    // les futurs deploiements quand on aura des migrations versionees).
    await log(`[provision] prisma migrate deploy + db push`);
    const dbSyncMode = process.env.OPS_TENANT_DB_SYNC ?? 'push';
    const prismaResolve =
      'if command -v prisma >/dev/null 2>&1; then PRISMA=prisma; ' +
      'elif [ -x ./node_modules/.bin/prisma ]; then PRISMA=./node_modules/.bin/prisma; ' +
      'elif command -v npx >/dev/null 2>&1; then PRISMA="npx -y prisma"; ' +
      'elif command -v pnpm >/dev/null 2>&1; then PRISMA="pnpm prisma"; ' +
      'else echo "ERR: prisma CLI introuvable" >&2; exit 1; fi';
    const migrateSteps =
      '$PRISMA migrate deploy --schema=./prisma/schema.prisma 2>&1 || true; ' +
      (dbSyncMode === 'push'
        ? '$PRISMA db push --schema=./prisma/schema.prisma --accept-data-loss=false --skip-generate'
        : 'echo "db push skipped (OPS_TENANT_DB_SYNC=migrate)"');
    const migrateCmd = `sh -c 'cd /app/apps/api 2>/dev/null || cd /app; ${prismaResolve}; ${migrateSteps}'`;
    const migrateResult = await this.docker.exec(creds, apiName, migrateCmd);
    if (migrateResult.code !== 0) {
      const detail = [migrateResult.stderr, migrateResult.stdout].filter(Boolean).join(' | ').trim();
      await log(`[provision] WARN migrate (code=${migrateResult.code}) : ${detail || '(no output)'}`);
    } else {
      // Affiche le resume du push (Prisma loggue "Your database is now in sync...")
      const summary = (migrateResult.stdout || '')
        .split('\n')
        .filter((l) => l.includes('sync') || l.includes('Applied') || l.includes('No migration'))
        .slice(-3)
        .join(' | ');
      if (summary) await log(`[provision] schema sync : ${summary}`);
    }

    // 8. Seed initial : creer Organization + admin user.
    //
    // L'ancienne version utilisait `sh -c "node -e \"...\""` avec des couches
    // d'echappement imbriquees qui cassaient des que le payload contenait un
    // `#` (couleurs primaryColor) ou des guillemets. Resultat : `primaryColor:
    // #1B5E20,` non quote, SyntaxError au parse Node. Solution propre : on
    // ecrit le script dans /tmp via heredoc puis on l'execute -- plus aucun
    // probleme d'echappement.
    // Mot de passe owner : genere aleatoire (16 chars URL-safe). Affiche en
    // clair dans les logs du job une seule fois -- admin doit le noter ou
    // le copier depuis le JobLogsViewer. Apres, seul un reset via
    // POST /tenants/:id/reset-owner-password peut regenerer un nouveau pwd.
    const ownerPassword = randomBytes(12).toString('base64url');
    await log(`[provision] seed initial Organization + admin owner`);
    await log(
      `[provision] OWNER CREDENTIALS : email=${tenant.ownerEmail} password=${ownerPassword} (NOTE-LE : non recuperable apres ce log)`,
    );
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
      ownerPassword,
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
    const hash = await bcrypt.hash(data.ownerPassword || 'changeme', 10);
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
    const tmpScript = `${config.vpsWorkDir}/seed-${tenant.slug}.js`;
    const tmpData = `${config.vpsWorkDir}/seed-${tenant.slug}.json`;
    const sshSeedCmd = `set -e
cat > ${tmpScript} <<'OPTIPACK_SEED_SCRIPT_EOF'
${seedScript}
OPTIPACK_SEED_SCRIPT_EOF
cat > ${tmpData} <<'OPTIPACK_SEED_DATA_EOF'
${JSON.stringify(seedPayload)}
OPTIPACK_SEED_DATA_EOF
docker cp ${tmpScript} ${apiName}:/app/seed.js
docker cp ${tmpData} ${apiName}:/app/seed.json
# IMPORTANT : node doit voir node_modules contenant @prisma/client +
# bcryptjs. Defense en profondeur :
#   1) WORKDIR /app/apps/api (matche WORKDIR du Dockerfile API)
#   2) NODE_PATH liste les 3 candidats node_modules (monorepo + root +
#      cwd) pour que le resolver trouve les modules d'ou qu'on lance.
#   3) On copie aussi seed.js dans /app/apps/api/seed.js en plus de
#      /app/seed.js, comme garde-fou.
docker exec ${apiName} cp /app/seed.js /app/apps/api/seed.js 2>/dev/null || true
docker exec \\
  -e SEED_DATA="$(cat ${tmpData})" \\
  -e NODE_PATH="/app/apps/api/node_modules:/app/node_modules:/app/apps/api/node_modules/.prisma/client" \\
  -w /app/apps/api \\
  ${apiName} \\
  sh -c 'node seed.js || node /app/seed.js'
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

  /**
   * Lit le fichier .env d'un tenant sur le VPS et retourne un dict
   * KEY=VALUE. Permet de reutiliser les credentials (postgres, jwt, minio)
   * sur les re-provisionings -- sinon le volume postgres persistant garde
   * l'ancien user/pass et l'API n'arrive plus a se connecter.
   *
   * Retourne null si le fichier n'existe pas (premier provision).
   */
  private async readExistingEnv(
    creds: SshConnection,
    envFile: string,
  ): Promise<Record<string, string> | null> {
    const r = await this.ssh.exec(creds, `test -f ${envFile} && cat ${envFile} || echo __NOFILE__`);
    if (r.code !== 0) return null;
    const out = (r.stdout || '').trim();
    if (out === '__NOFILE__' || out === '') return null;
    const result: Record<string, string> = {};
    for (const line of out.split('\n')) {
      const idx = line.indexOf('=');
      if (idx <= 0) continue;
      const k = line.slice(0, idx).trim();
      const v = line.slice(idx + 1);
      if (k) result[k] = v;
    }
    return result;
  }
}
