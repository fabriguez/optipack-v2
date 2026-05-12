/**
 * Seed initial pour l'orchestrator :
 * - Cree un super-admin par defaut si aucun n'existe
 * - Optionnellement, cree le VPS "self" + le tenant principal (isMain=true)
 *   pour que l'orchestrator pilote Caddy meme pour le tenant du proprietaire.
 *
 * Usage :
 *   OPS_DATABASE_URL=... npx tsx prisma/seed.ts
 *
 * Variables d'env pertinentes :
 *   SEED_OPS_ADMIN_EMAIL, SEED_OPS_ADMIN_PASSWORD, SEED_OPS_ADMIN_NAME
 *   SEED_MAIN_TENANT=true                    -> active le seed du tenant principal
 *   SEED_MAIN_TENANT_SLUG    (def: "main")   -> slug interne (n'apparait pas dans les URLs publiques)
 *   SEED_MAIN_TENANT_NAME    (def: "OptiPack Main Tenant")
 *   SEED_MAIN_TENANT_EMAIL   (def: SEED_OPS_ADMIN_EMAIL)
 *   SEED_MAIN_TENANT_API_PORT       (def: 3009)
 *   SEED_MAIN_TENANT_WEB_PORT       (def: 3008)
 *   SEED_MAIN_TENANT_WEB_CLIENT_PORT(def: 3010)
 *   SEED_SELF_VPS_HOST       (def: "127.0.0.1")
 *   SEED_SELF_VPS_NAME       (def: "self")
 */
import bcrypt from 'bcryptjs';
import { PrismaClient } from '../node_modules/.prisma/orchestrator-client';

const prisma = new PrismaClient();

async function seedOpsAdmin() {
  const email = process.env.SEED_OPS_ADMIN_EMAIL ?? 'admin@transitsoftservices.com';
  const password = process.env.SEED_OPS_ADMIN_PASSWORD ?? 'changeme-in-production';
  const fullName = process.env.SEED_OPS_ADMIN_NAME ?? 'Ops Super Admin';

  const existing = await prisma.opsAdmin.findUnique({ where: { email } });
  if (existing) {
    console.log(`[seed] OpsAdmin ${email} existe deja, skip`);
    return;
  }
  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.opsAdmin.create({
    data: { email, passwordHash, fullName, isSuperAdmin: true, isActive: true },
  });
  console.log(`[seed] OpsAdmin cree : ${email}`);
  console.log(`[seed] Password initial : ${password}`);
  console.log('[seed] IMPORTANT : se connecter et configurer le 2FA des le premier login');
}

async function seedMainTenant() {
  if (process.env.SEED_MAIN_TENANT !== 'true') {
    console.log('[seed] SEED_MAIN_TENANT != true, skip tenant principal');
    return;
  }

  const slug = process.env.SEED_MAIN_TENANT_SLUG ?? 'main';
  const name = process.env.SEED_MAIN_TENANT_NAME ?? 'OptiPack Main Tenant';
  const ownerEmail =
    process.env.SEED_MAIN_TENANT_EMAIL ??
    process.env.SEED_OPS_ADMIN_EMAIL ??
    'admin@transitsoftservices.com';

  const apiPort = Number(process.env.SEED_MAIN_TENANT_API_PORT ?? 3009);
  const webPort = Number(process.env.SEED_MAIN_TENANT_WEB_PORT ?? 3008);
  const webClientPort = Number(process.env.SEED_MAIN_TENANT_WEB_CLIENT_PORT ?? 3010);

  const selfHost = process.env.SEED_SELF_VPS_HOST ?? '127.0.0.1';
  const selfName = process.env.SEED_SELF_VPS_NAME ?? 'self';

  let selfVps = await prisma.vPS.findFirst({ where: { name: selfName } });
  if (!selfVps) {
    selfVps = await prisma.vPS.create({
      data: {
        name: selfName,
        host: selfHost,
        port: 22,
        username: 'root',
        // Placeholder : jamais utilise car le tenant principal a isMain=true
        // -> ProvisionTenantUseCase refuse de SSH dessus.
        sshKeyEncrypted: '00:00:00',
        notes: 'VPS hebergeant l\'orchestrator + le tenant principal',
        status: 'ACTIVE',
      },
    });
    console.log(`[seed] VPS self cree : ${selfName} (${selfHost})`);
  } else {
    console.log(`[seed] VPS self existe deja : ${selfName}`);
  }

  const existing = await prisma.tenant.findFirst({ where: { isMain: true } });
  if (existing) {
    console.log(`[seed] Tenant principal existe deja : ${existing.slug} (${existing.name})`);
    return;
  }

  const t = await prisma.tenant.create({
    data: {
      slug,
      name,
      ownerEmail,
      ownerUsername: ownerEmail.split('@')[0] ?? 'owner',
      vpsId: selfVps.id,
      apiPort,
      webPort,
      webClientPort,
      isMain: true,
      status: 'ACTIVE',
      autoUpdatePolicy: 'MANUAL',
    },
  });
  console.log(`[seed] Tenant principal cree : id=${t.id} slug=${t.slug} api=${apiPort}/web=${webPort}/wc=${webClientPort}`);
  console.log('[seed] Orchestrator pilotera Caddy pour app./www./api. (URL plates).');
}

async function main() {
  await seedOpsAdmin();
  await seedMainTenant();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
