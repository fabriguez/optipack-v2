import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { seedPermissionsAndPositions, migrateLegacyRolePositions } from './seed/permissions.seed';
import { DEFAULT_CHART_OF_ACCOUNTS } from '../src/domain/accounting/chart-of-accounts';
const prisma = new PrismaClient();

// UUIDs fixes pour le seed (idempotent)
const ORG_ID = '00000000-0000-4000-a000-000000000001';
const ADMIN_ID = '00000000-0000-4000-a000-000000000010';

// Bump this version when seed content changes to force a re-run
// v4 : ajout cle client.partner.manage (statut partenaire, role dedie)
const SEED_VERSION = process.env.SEED_VERSION || '4';
const SEED_MARKER_KEY = 'seed_version';

async function main() {
  console.log('Seeding database...');

  // Garde-fou securite : le contenu ci-dessous (org "TransitSoftServices" a UUID
  // FIXE 00000000-...-0001, admin@transitsoftservices.com / Admin123! en
  // SUPER_ADMIN, agences DLA/YDE/BFM) est du seed de demo/tenant PRINCIPAL. Il ne
  // doit JAMAIS atterrir dans la base d'un tenant secondaire : sinon chaque tenant
  // embarque une organisation fantome + des identifiants par defaut CONNUS avec
  // role super-admin (faille critique). Reserve donc au tenant principal et au dev
  // via SEED_DEMO_DATA=true. Les tenants secondaires (provisionnes par
  // l'orchestrator) obtiennent leurs postes/permissions et leur plan comptable via
  // le self-heal au boot de l'API (PermissionSeedService / AccountingAccountService),
  // pas via ce seed.
  if (process.env.SEED_DEMO_DATA !== 'true') {
    console.log('SEED_DEMO_DATA != "true" -> seed de demo/principal ignore (tenant secondaire).');
    return;
  }

  // Guard: skip if the same seed version was already applied for this org
  const existingMarker = await prisma.systemConfig.findUnique({
    where: { organizationId_key: { organizationId: ORG_ID, key: SEED_MARKER_KEY } },
  }).catch(() => null);

  if (existingMarker?.value === SEED_VERSION && process.env.FORCE_SEED !== 'true') {
    console.log(`Seed version ${SEED_VERSION} already applied. Skipping.`);
    return;
  }

  const org = await prisma.organization.upsert({
    where: { id: ORG_ID },
    update: {},
    create: {
      id: ORG_ID,
      name: 'TransitSoftServices',
      defaultCurrency: 'XAF',
      defaultLanguage: 'fr',
    },
  });
  console.log(`Organization: ${org.name}`);

  const passwordHash = await bcrypt.hash('Admin123!', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@transitsoftservices.com' },
    update: {},
    create: {
      id: ADMIN_ID,
      email: 'admin@transitsoftservices.com',
      passwordHash,
      firstName: 'Admin',
      lastName: 'TransitSoftServices',
      phone: '+237600000000',
      role: 'SUPER_ADMIN',
      isActive: true,
      isVerified: true,
      organization: { connect: { id: org.id } },
    },
  });
  console.log(`Admin: ${admin.email}`);

  const agencies = [
    { name: 'Agence Douala', code: 'DLA', city: 'Douala', country: 'Cameroun', phone: '+237233000001', address: 'Rue de la Joie, Akwa' },
    { name: 'Agence Yaounde', code: 'YDE', city: 'Yaounde', country: 'Cameroun', phone: '+237222000002', address: 'Boulevard du 20 Mai' },
    { name: 'Agence Bafoussam', code: 'BFM', city: 'Bafoussam', country: 'Cameroun', phone: '+237233000003', address: 'Carrefour Total' },
  ];

  for (const agencyData of agencies) {
    const agency = await prisma.agency.upsert({
      where: { code: agencyData.code },
      update: {},
      create: {
        ...agencyData,
        organization: { connect: { id: org.id } },
      },
    });

    await prisma.userAgency.upsert({
      where: { userId_agencyId: { userId: admin.id, agencyId: agency.id } },
      update: {},
      create: { userId: admin.id, agencyId: agency.id },
    });

    // Warehouse -- use findFirst + create instead of upsert with generated id
    const existingWh = await prisma.warehouse.findFirst({
      where: { agencyId: agency.id, name: `Entrepot ${agencyData.city}` },
    });
    if (!existingWh) {
      await prisma.warehouse.create({
        data: {
          name: `Entrepot ${agencyData.city}`,
          location: agencyData.address,
          agency: { connect: { id: agency.id } },
        },
      });
    }

    console.log(`Agency: ${agency.name} + Warehouse`);
  }

  // Plan comptable : source de vérité partagée avec le self-heal runtime
  // (AccountingAccountService), cf src/domain/accounting/chart-of-accounts.ts.
  const accounts = DEFAULT_CHART_OF_ACCOUNTS;

  for (const acc of accounts) {
    await prisma.accountingAccount.upsert({
      where: { code: acc.code },
      update: {},
      create: { ...acc, organization: { connect: { id: org.id } } },
    });
  }
  console.log('Accounting accounts created');

  await prisma.currency.upsert({
    where: { organizationId_code: { organizationId: org.id, code: 'XAF' } },
    update: {},
    create: {
      code: 'XAF',
      name: 'Franc CFA',
      symbol: 'FCFA',
      exchangeRate: 1,
      isBase: true,
      organization: { connect: { id: org.id } },
    },
  });
  console.log('Currency XAF created');

  // System config defaults
  const configs = [
    { key: 'penalty_daily_rate', value: '500', description: 'Taux journalier de penalite (XAF)' },
    { key: 'penalty_grace_days', value: '10', description: 'Jours de grace avant penalite' },
    { key: 'loyalty_points_divisor', value: '1000', description: 'Diviseur pour le calcul des points' },
  ];
  for (const cfg of configs) {
    await prisma.systemConfig.upsert({
      where: { organizationId_key: { organizationId: org.id, key: cfg.key } },
      update: {},
      create: { ...cfg, organization: { connect: { id: org.id } } },
    });
  }
  console.log('System config created');

  // ============================================================
  // ABAC : Permissions, Postes, Matrice de droits (cf. PERMISSIONS-PLAN.md)
  // ============================================================
  await seedPermissionsAndPositions(prisma, org.id);
  await migrateLegacyRolePositions(prisma, org.id);

  // Write/refresh the seed marker so subsequent runs are skipped
  await prisma.systemConfig.upsert({
    where: { organizationId_key: { organizationId: org.id, key: SEED_MARKER_KEY } },
    update: { value: SEED_VERSION, description: 'Marker tracking the last applied seed version' },
    create: {
      key: SEED_MARKER_KEY,
      value: SEED_VERSION,
      description: 'Marker tracking the last applied seed version',
      organization: { connect: { id: org.id } },
    },
  });

  console.log(`Seed completed! (version ${SEED_VERSION})`);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
