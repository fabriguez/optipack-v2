import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
const prisma = new PrismaClient();

// UUIDs fixes pour le seed (idempotent)
const ORG_ID = '00000000-0000-4000-a000-000000000001';
const ADMIN_ID = '00000000-0000-4000-a000-000000000010';

// Bump this version when seed content changes to force a re-run
const SEED_VERSION = process.env.SEED_VERSION || '2';
const SEED_MARKER_KEY = 'seed_version';

async function main() {
  console.log('Seeding database...');

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

  // ============================================================
  // PHASE 1 RH : Permissions, Postes, Matrice de droits
  // ============================================================
  await seedPermissionsAndPositions(org.id);

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

// ============================================================
// PERMISSIONS & POSITIONS (Phase 1 RH/ABAC)
// ============================================================

// Cle stable referencee dans le code (middleware requirePermission, hooks UI).
// Modifier la cle = breaking change. Le libelle/categorie peut evoluer librement.
const PERMISSION_CATALOG: Array<{ key: string; label: string; category: string; description?: string }> = [
  // personnel
  { key: 'personnel.read', label: 'Voir le personnel', category: 'personnel' },
  { key: 'personnel.create', label: 'Creer un membre du personnel', category: 'personnel' },
  { key: 'personnel.update', label: 'Modifier un membre du personnel', category: 'personnel' },
  { key: 'personnel.delete', label: 'Supprimer un membre du personnel', category: 'personnel' },
  { key: 'attendance.read', label: 'Consulter les pointages', category: 'personnel' },
  { key: 'attendance.mark', label: 'Pointer le personnel', category: 'personnel' },
  { key: 'attendance.justify', label: 'Justifier une absence/retard', category: 'personnel' },
  { key: 'attendance.justify.review', label: 'Valider/rejeter une justification', category: 'personnel' },
  { key: 'leave.read', label: 'Voir les conges', category: 'personnel' },
  { key: 'leave.request', label: 'Demander un conge', category: 'personnel' },
  { key: 'leave.validate', label: 'Valider un conge', category: 'personnel' },
  { key: 'leave.end_early', label: 'Mettre fin a un conge', category: 'personnel' },
  { key: 'sanction.read', label: 'Voir les sanctions', category: 'personnel' },
  { key: 'sanction.manage', label: 'Gerer les sanctions', category: 'personnel' },
  { key: 'schedule.manage', label: 'Gerer les plannings RH', category: 'personnel' },
  { key: 'holiday.manage', label: 'Gerer les jours non ouvres', category: 'personnel' },
  { key: 'review.read', label: 'Voir les evaluations', category: 'personnel' },
  { key: 'review.manage', label: 'Gerer les evaluations', category: 'personnel' },
  { key: 'payslip.read', label: 'Voir les fiches de paie', category: 'personnel' },
  { key: 'payslip.generate', label: 'Generer une fiche de paie', category: 'personnel' },
  { key: 'payroll.pay', label: 'Payer un salaire', category: 'personnel' },

  // clients
  { key: 'client.read', label: 'Voir les clients', category: 'clients' },
  { key: 'client.create', label: 'Creer un client', category: 'clients' },
  { key: 'client.update', label: 'Modifier un client', category: 'clients' },

  // colis
  { key: 'parcel.read', label: 'Voir les colis', category: 'colis' },
  { key: 'parcel.create', label: 'Creer un colis', category: 'colis' },
  { key: 'parcel.update', label: 'Modifier un colis', category: 'colis' },
  { key: 'parcel.deliver', label: 'Remettre un colis', category: 'colis' },
  { key: 'parcelgroup.manage', label: 'Gerer les groupes de colis', category: 'colis' },
  { key: 'container.manage', label: 'Gerer les conteneurs', category: 'colis' },
  { key: 'manifest.manage', label: 'Gerer les manifestes', category: 'colis' },
  { key: 'warehouse.read', label: 'Voir l\'entrepot', category: 'colis' },
  { key: 'warehouse.manage', label: 'Gerer l\'entrepot', category: 'colis' },

  // finance
  { key: 'cashregister.read', label: 'Voir la caisse', category: 'finance' },
  { key: 'cashregister.close', label: 'Cloturer la caisse', category: 'finance' },
  { key: 'cashregister.disburse', label: 'Decaisser depuis la caisse', category: 'finance' },
  // Cree un bon de decaissement. Reserve a l'admin (et SUPER_ADMIN) : un admin
  // peut soit choisir l'ordonnateur (employe avec disbursement.order), soit
  // s'auto-designer comme ordonnateur.
  { key: 'disbursement.create', label: 'Creer un bon de decaissement', category: 'finance' },
  // Permet a un employe d'etre selectionne comme ordonnateur d'un decaissement.
  // L'ordonnateur valide la depense mais ne l'enregistre pas necessairement.
  { key: 'disbursement.order', label: 'Ordonner une depense', category: 'finance' },
  { key: 'expense.read', label: 'Voir les depenses', category: 'finance' },
  { key: 'expense.create', label: 'Saisir une depense', category: 'finance' },
  { key: 'expense.approve', label: 'Approuver une depense', category: 'finance' },
  { key: 'invoice.read', label: 'Voir les factures', category: 'finance' },
  { key: 'invoice.manage', label: 'Gerer les factures', category: 'finance' },
  { key: 'transfer.initiate', label: 'Initier un transfert de fonds', category: 'finance' },
  { key: 'transfer.confirm', label: 'Confirmer un transfert', category: 'finance' },
  { key: 'accounting.read', label: 'Consulter la comptabilite', category: 'finance' },
  { key: 'accounting.manage', label: 'Gerer la comptabilite', category: 'finance' },

  // agence
  { key: 'agency.read', label: 'Voir l\'agence', category: 'agence' },
  { key: 'agency.manage', label: 'Gerer les parametres d\'agence', category: 'agence' },
  { key: 'charge.manage', label: 'Gerer les charges recurrentes', category: 'agence' },
  { key: 'dailyreport.read', label: 'Voir les rapports journaliers', category: 'agence' },
  { key: 'dailyreport.manage', label: 'Gerer les rapports journaliers', category: 'agence' },

  // admin
  { key: 'position.manage', label: 'Gerer les postes', category: 'admin' },
  { key: 'permission.manage', label: 'Gerer la matrice des permissions', category: 'admin' },
  { key: 'user.manage', label: 'Gerer les utilisateurs', category: 'admin' },
  { key: 'system.config', label: 'Configurer le systeme', category: 'admin' },
];

// Mapping poste -> permissions par defaut. L'admin pourra ensuite ajuster.
// "*" = toutes les permissions du catalogue.
const POSITION_CATALOG: Array<{
  name: string;
  description: string;
  hierarchyLevel: number;
  permissions: string[] | '*';
}> = [
  {
    name: 'Chef d\'agence',
    description: 'Responsable d\'une agence : encadrement personnel, validations, supervision finance.',
    hierarchyLevel: 10,
    permissions: [
      'personnel.read', 'personnel.create', 'personnel.update',
      'attendance.read', 'attendance.mark', 'attendance.justify.review',
      'leave.read', 'leave.validate', 'leave.end_early',
      'sanction.read', 'sanction.manage',
      'schedule.manage', 'holiday.manage',
      'review.read', 'review.manage',
      'payslip.read', 'payslip.generate', 'payroll.pay',
      'client.read', 'client.create', 'client.update',
      'parcel.read', 'parcel.create', 'parcel.update', 'parcel.deliver',
      'parcelgroup.manage', 'container.manage', 'manifest.manage',
      'warehouse.read', 'warehouse.manage',
      'cashregister.read', 'cashregister.close', 'cashregister.disburse',
      'expense.read', 'expense.create', 'expense.approve',
      'invoice.read', 'invoice.manage',
      'transfer.initiate', 'transfer.confirm',
      'accounting.read',
      'agency.read', 'agency.manage', 'charge.manage',
      'dailyreport.read', 'dailyreport.manage',
    ],
  },
  {
    name: 'Superviseur',
    description: 'Supervision operationnelle d\'une equipe au sein de l\'agence.',
    hierarchyLevel: 20,
    permissions: [
      'personnel.read',
      'attendance.read', 'attendance.mark', 'attendance.justify.review',
      'leave.read', 'leave.validate',
      'sanction.read',
      'review.read',
      'parcel.read', 'parcel.create', 'parcel.update',
      'client.read', 'client.create',
      'cashregister.read', 'cashregister.close',
      'dailyreport.read',
      'agency.read',
    ],
  },
  {
    name: 'Comptable',
    description: 'Gestion comptable et financiere.',
    hierarchyLevel: 30,
    permissions: [
      'personnel.read',
      'payslip.read', 'payslip.generate',
      'cashregister.read',
      'expense.read', 'expense.create', 'expense.approve',
      'invoice.read', 'invoice.manage',
      'transfer.initiate',
      'accounting.read', 'accounting.manage',
      'charge.manage',
      'dailyreport.read',
      'agency.read',
      'attendance.read', 'leave.read',
    ],
  },
  {
    name: 'Magasinier',
    description: 'Gestion de l\'entrepot et des stocks.',
    hierarchyLevel: 40,
    permissions: [
      'parcel.read', 'parcel.update',
      'container.manage', 'manifest.manage',
      'warehouse.read', 'warehouse.manage',
      'agency.read',
      'attendance.mark', 'leave.request', 'attendance.justify',
    ],
  },
  {
    name: 'Logisticien',
    description: 'Coordination logistique et transit inter-agences.',
    hierarchyLevel: 40,
    permissions: [
      'parcel.read', 'parcel.create', 'parcel.update',
      'parcelgroup.manage', 'container.manage', 'manifest.manage',
      'warehouse.read',
      'agency.read',
      'attendance.mark', 'leave.request', 'attendance.justify',
    ],
  },
  {
    name: 'Agent',
    description: 'Agent de comptoir : enregistrement colis, encaissement, relation client.',
    hierarchyLevel: 50,
    permissions: [
      'parcel.read', 'parcel.create', 'parcel.update', 'parcel.deliver',
      'client.read', 'client.create', 'client.update',
      'parcelgroup.manage',
      'cashregister.read',
      'invoice.read',
      'agency.read',
      'attendance.mark', 'leave.request', 'attendance.justify',
    ],
  },
  {
    name: 'Commercial',
    description: 'Prospection, gestion partenaires et tarifs partenaires.',
    hierarchyLevel: 50,
    permissions: [
      'client.read', 'client.create', 'client.update',
      'parcel.read',
      'agency.read',
      'attendance.mark', 'leave.request', 'attendance.justify',
    ],
  },
  {
    name: 'Stagiaire',
    description: 'Acces minimal en lecture (apprentissage).',
    hierarchyLevel: 80,
    permissions: [
      'parcel.read', 'client.read', 'agency.read',
      'attendance.mark', 'leave.request', 'attendance.justify',
    ],
  },
];

async function seedPermissionsAndPositions(organizationId: string) {
  // 1) Catalogue de permissions (idempotent par key)
  const permByKey = new Map<string, string>();
  for (const p of PERMISSION_CATALOG) {
    const row = await prisma.permission.upsert({
      where: { key: p.key },
      update: { label: p.label, category: p.category, description: p.description ?? null },
      create: {
        key: p.key,
        label: p.label,
        category: p.category,
        description: p.description ?? null,
        isSystem: true,
      },
    });
    permByKey.set(p.key, row.id);
  }
  console.log(`Permissions seedees: ${permByKey.size}`);

  // 2) Postes globaux (agencyId=null) idempotents par (organizationId, agencyId, name)
  for (const pos of POSITION_CATALOG) {
    const existing = await prisma.position.findFirst({
      where: { organizationId, agencyId: null, name: pos.name },
    });
    const position = existing
      ? await prisma.position.update({
          where: { id: existing.id },
          data: { description: pos.description, hierarchyLevel: pos.hierarchyLevel, isSystem: true },
        })
      : await prisma.position.create({
          data: {
            organizationId,
            agencyId: null,
            name: pos.name,
            description: pos.description,
            hierarchyLevel: pos.hierarchyLevel,
            isSystem: true,
          },
        });

    // 3) Matrice de droits (reset puis re-set pour les postes systeme : la verite est le seed)
    const targetKeys = pos.permissions === '*'
      ? Array.from(permByKey.keys())
      : pos.permissions;
    await prisma.positionPermission.deleteMany({ where: { positionId: position.id } });
    await prisma.positionPermission.createMany({
      data: targetKeys
        .map((k) => permByKey.get(k))
        .filter((id): id is string => !!id)
        .map((permissionId) => ({ positionId: position.id, permissionId })),
      skipDuplicates: true,
    });
  }
  console.log(`Postes seedes: ${POSITION_CATALOG.length}`);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
