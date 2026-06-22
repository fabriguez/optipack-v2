/**
 * Seed idempotent pour l'orchestrator.
 * Peut etre relance a chaque boot (OPS_RUN_SEED=true) sans effet de bord :
 * chaque entite est upsertee depuis les variables d'env. Changer une variable
 * = mise a jour de l'entite correspondante au prochain boot.
 *
 * Variables d'env :
 *   SEED_OPS_ADMIN_EMAIL          (def: admin@transitsoftservices.com)
 *   SEED_OPS_ADMIN_PASSWORD       (def: changeme-in-production)
 *   SEED_OPS_ADMIN_NAME           (def: Ops Super Admin)
 *   SEED_OPS_ADMIN_TOTP_SECRET    secret TOTP base32. Absent = 2FA desactive.
 *                                 Present = 2FA active avec ce secret.
 *                                 Change = reconfig 2FA avec le nouveau secret.
 *
 *   SEED_MAIN_TENANT=true         active le seed du tenant principal
 *   SEED_MAIN_TENANT_SLUG         (def: "main")
 *   SEED_MAIN_TENANT_NAME         (def: "OptiPack Main Tenant")
 *   SEED_MAIN_TENANT_EMAIL        (def: SEED_OPS_ADMIN_EMAIL)
 *   SEED_MAIN_TENANT_API_PORT     (def: 3009)
 *   SEED_MAIN_TENANT_WEB_PORT     (def: 3008)
 *   SEED_MAIN_TENANT_WEB_CLIENT_PORT (def: 3010)
 *   SEED_SELF_VPS_HOST            (def: "127.0.0.1")
 *   SEED_SELF_VPS_NAME            (def: "self")
 */
import bcrypt from 'bcryptjs';
import { PrismaClient } from '../node_modules/.prisma/orchestrator-client';

const prisma = new PrismaClient();

function log(msg: string) {
  console.log(`[seed] ${msg}`);
}

function debugEnv() {
  log('--- env vars ---');
  log(`OPS_RUN_SEED          = ${process.env.OPS_RUN_SEED ?? '(unset)'}`);
  log(`SEED_OPS_ADMIN_EMAIL  = ${process.env.SEED_OPS_ADMIN_EMAIL ?? '(unset -> default)'}`);
  log(`SEED_OPS_ADMIN_NAME   = ${process.env.SEED_OPS_ADMIN_NAME ?? '(unset -> default)'}`);
  log(`SEED_OPS_ADMIN_PASSWORD set? ${process.env.SEED_OPS_ADMIN_PASSWORD ? 'yes' : 'no (default)'}`);
  log(`SEED_OPS_ADMIN_TOTP_SECRET set? ${process.env.SEED_OPS_ADMIN_TOTP_SECRET ? 'yes' : 'no -> 2FA off'}`);
  log(`SEED_MAIN_TENANT      = ${process.env.SEED_MAIN_TENANT ?? '(unset -> false)'}`);
  log('--- end env ---');
}

async function seedOpsAdmin() {
  log('seedOpsAdmin() start');
  const email = process.env.SEED_OPS_ADMIN_EMAIL ?? 'admin@transitsoftservices.com';
  const password = process.env.SEED_OPS_ADMIN_PASSWORD ?? 'changeme-in-production';
  const fullName = process.env.SEED_OPS_ADMIN_NAME ?? 'Ops Super Admin';
  const totpSecret = process.env.SEED_OPS_ADMIN_TOTP_SECRET?.trim() || null;

  const passwordHash = await bcrypt.hash(password, 10);

  const twoFactorData = totpSecret
    ? { twoFactorSecret: totpSecret, twoFactorEnabled: true }
    : { twoFactorSecret: null, twoFactorEnabled: false, twoFactorRecoveryCodes: [] };

  // Cherche d abord par email exact, sinon prend le premier super-admin existant.
  // Permet de changer l email sans creer de doublon : l ancien est mis a jour.
  const byEmail = await prisma.opsAdmin.findUnique({ where: { email }, select: { id: true } });
  const existing = byEmail ?? await prisma.opsAdmin.findFirst({
    where: { isSuperAdmin: true },
    select: { id: true, email: true },
  });

  if (existing) {
    await prisma.opsAdmin.update({
      where: { id: existing.id },
      data: { email, passwordHash, fullName, isActive: true, ...twoFactorData },
    });
    const emailChanged = (existing as { email?: string }).email !== email;
    console.log(`[seed] OpsAdmin mis a jour : ${emailChanged ? `${(existing as any).email} -> ${email}` : email}`);
  } else {
    await prisma.opsAdmin.create({
      data: { email, passwordHash, fullName, isSuperAdmin: true, isActive: true, ...twoFactorData },
    });
    console.log(`[seed] OpsAdmin cree : ${email}`);
  }
  if (totpSecret) {
    log(`2FA TOTP active (secret: ${totpSecret.slice(0, 6)}...)`);
  } else {
    log('2FA desactive (SEED_OPS_ADMIN_TOTP_SECRET absent)');
  }
  log('seedOpsAdmin() done');
}

async function seedMainTenant() {
  log('seedMainTenant() start');
  if (process.env.SEED_MAIN_TENANT !== 'true') {
    log('SEED_MAIN_TENANT != true, skip');
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

  // VPS "self" : upsert par nom (findFirst + create|update).
  let selfVps = await prisma.vPS.findFirst({ where: { name: selfName } });
  if (!selfVps) {
    selfVps = await prisma.vPS.create({
      data: {
        name: selfName,
        host: selfHost,
        port: 22,
        username: 'root',
        sshKeyEncrypted: '00:00:00',
        notes: "VPS hebergeant l'orchestrator + le tenant principal",
        status: 'ACTIVE',
      },
    });
    console.log(`[seed] VPS self cree : ${selfName} (${selfHost})`);
  } else {
    selfVps = await prisma.vPS.update({
      where: { id: selfVps.id },
      data: { host: selfHost, name: selfName, status: 'ACTIVE' },
    });
    console.log(`[seed] VPS self mis a jour : ${selfName} (${selfHost})`);
  }

  // Tenant principal : upsert par slug. Si le slug a change en env, l'ancien
  // tenant isMain reste; le nouveau est cree et marque isMain. Cas rare.
  const existing = await prisma.tenant.findFirst({ where: { isMain: true } });

  if (existing) {
    await prisma.tenant.update({
      where: { id: existing.id },
      data: {
        name,
        ownerEmail,
        ownerUsername: ownerEmail.split('@')[0] ?? 'owner',
        vpsId: selfVps.id,
        apiPort,
        webPort,
        webClientPort,
      },
    });
    console.log(`[seed] Tenant principal mis a jour : slug=${existing.slug} api=${apiPort}/web=${webPort}/wc=${webClientPort}`);
  } else {
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
  }
}

async function main() {
  log('=== seed start ===');
  debugEnv();
  await seedOpsAdmin();
  await seedMainTenant();
  log('=== seed done ===');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
