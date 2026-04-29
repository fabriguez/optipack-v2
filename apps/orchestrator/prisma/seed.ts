/**
 * Seed initial pour l'orchestrator :
 * - Cree un super-admin par defaut si aucun n'existe
 *
 * Usage : OPS_DATABASE_URL=... npx tsx prisma/seed.ts
 *
 * Le super-admin doit configurer son 2FA au premier login.
 */
import bcrypt from 'bcryptjs';
import { PrismaClient } from '../node_modules/.prisma/orchestrator-client';

const prisma = new PrismaClient();

async function main() {
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
    data: {
      email,
      passwordHash,
      fullName,
      isSuperAdmin: true,
      isActive: true,
    },
  });

  console.log(`[seed] OpsAdmin cree : ${email}`);
  console.log(`[seed] Password initial : ${password}`);
  console.log('[seed] IMPORTANT : se connecter et configurer le 2FA des le premier login');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
