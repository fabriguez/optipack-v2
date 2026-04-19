import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
const prisma = new PrismaClient();

// UUIDs fixes pour le seed (idempotent)
const ORG_ID = '00000000-0000-4000-a000-000000000001';
const ADMIN_ID = '00000000-0000-4000-a000-000000000010';

async function main() {
  console.log('Seeding database...');

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

  const accounts = [
    { code: '101000', name: 'Caisse', type: 'ASSET' as const },
    { code: '102000', name: 'Banque', type: 'ASSET' as const },
    { code: '301000', name: 'Creances Clients', type: 'ASSET' as const },
    { code: '401000', name: 'Dettes Fournisseurs', type: 'LIABILITY' as const },
    { code: '501000', name: 'Capital', type: 'EQUITY' as const },
    { code: '601000', name: 'Revenus Transport', type: 'REVENUE' as const },
    { code: '602000', name: 'Revenus Penalites', type: 'REVENUE' as const },
    { code: '701000', name: 'Charges Exploitation', type: 'EXPENSE' as const },
    { code: '702000', name: 'Salaires', type: 'EXPENSE' as const },
  ];

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

  console.log('Seed completed!');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
