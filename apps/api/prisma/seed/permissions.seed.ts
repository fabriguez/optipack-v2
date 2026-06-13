import type { PrismaClient } from '@prisma/client';

// ============================================================
// CATALOGUE DE PERMISSIONS (ABAC)
// ============================================================
// Cle stable referencee dans le code (middleware requirePermission, hooks UI,
// ROUTE_POLICY front). Modifier une cle = breaking change. Le libelle et la
// categorie peuvent evoluer librement (upsert les met a jour).
// Convention : `<ressource>.<action>` ; `manage` n'implique PAS `read` —
// les presets de postes accordent les deux explicitement.

export const PERMISSION_CATALOG: Array<{ key: string; label: string; category: string; description?: string }> = [
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
  { key: 'client.delete', label: 'Supprimer un client', category: 'clients' },
  { key: 'client.contact.read', label: 'Voir les coordonnees clients (tel, email, adresse, pieces)', category: 'clients', description: 'PII : sans cette permission, telephone/email/adresse/documents des clients sont masques.' },

  // kyc
  { key: 'kyc.read', label: 'Voir les verifications KYC', category: 'kyc' },
  { key: 'kyc.validate', label: 'Valider/rejeter un KYC', category: 'kyc' },

  // colis
  { key: 'parcel.read', label: 'Voir les colis', category: 'colis' },
  { key: 'parcel.create', label: 'Creer un colis', category: 'colis' },
  { key: 'parcel.update', label: 'Modifier un colis', category: 'colis' },
  { key: 'parcel.delete', label: 'Supprimer un colis', category: 'colis' },
  { key: 'parcel.deliver', label: 'Remettre un colis', category: 'colis' },
  { key: 'parcel.archive', label: 'Archiver un colis', category: 'colis' },
  { key: 'parcelgroup.manage', label: 'Gerer les groupes de colis', category: 'colis' },

  // magasin
  { key: 'warehouse.read', label: 'Voir les entrepots', category: 'magasin' },
  { key: 'warehouse.manage', label: 'Gerer les entrepots', category: 'magasin' },
  { key: 'warehouse.inventory.manage', label: 'Gerer les inventaires', category: 'magasin' },

  // conteneur
  { key: 'container.read', label: 'Voir les conteneurs', category: 'conteneur' },
  { key: 'container.manage', label: 'Gerer les conteneurs', category: 'conteneur' },
  { key: 'manifest.read', label: 'Voir les manifestes', category: 'conteneur' },
  { key: 'manifest.manage', label: 'Gerer les manifestes', category: 'conteneur' },

  // transport
  { key: 'carrier.read', label: 'Voir les transporteurs', category: 'transport' },
  { key: 'carrier.manage', label: 'Gerer les transporteurs', category: 'transport' },
  { key: 'transitroute.read', label: 'Voir les routes de transit', category: 'transport' },
  { key: 'transitroute.manage', label: 'Gerer les routes de transit', category: 'transport' },

  // facturation
  { key: 'invoice.read', label: 'Voir les factures', category: 'facturation' },
  { key: 'invoice.manage', label: 'Gerer les factures (creer, modifier, annuler)', category: 'facturation' },
  { key: 'invoice.discount', label: 'Appliquer une remise', category: 'facturation' },
  { key: 'invoice.export', label: 'Exporter les factures (PDF/XLSX)', category: 'facturation' },

  // paiement
  { key: 'payment.read', label: 'Voir les paiements', category: 'paiement' },
  { key: 'payment.record', label: 'Enregistrer un paiement', category: 'paiement' },
  { key: 'payment.void', label: 'Annuler un paiement', category: 'paiement' },

  // caisse
  { key: 'cashregister.read', label: 'Voir la caisse', category: 'caisse' },
  { key: 'cashregister.open', label: 'Ouvrir la caisse', category: 'caisse' },
  { key: 'cashregister.close', label: 'Cloturer la caisse', category: 'caisse' },
  { key: 'cashregister.disburse', label: 'Decaisser depuis la caisse', category: 'caisse' },

  // decaissement
  { key: 'disbursement.read', label: 'Voir les decaissements', category: 'decaissement' },
  // Cree un bon de decaissement. L'emetteur peut soit choisir l'ordonnateur
  // (employe avec disbursement.order), soit s'auto-designer comme ordonnateur.
  { key: 'disbursement.create', label: 'Creer un bon de decaissement', category: 'decaissement' },
  // Permet a un employe d'etre selectionne comme ordonnateur d'un decaissement.
  // L'ordonnateur valide la depense mais ne l'enregistre pas necessairement.
  { key: 'disbursement.order', label: 'Ordonner une depense', category: 'decaissement' },
  { key: 'disbursement.approve', label: 'Approuver un decaissement', category: 'decaissement' },
  { key: 'disbursement.void', label: 'Annuler un decaissement', category: 'decaissement' },

  // transfert
  { key: 'transfer.read', label: 'Voir les transferts de fonds', category: 'transfert' },
  { key: 'transfer.initiate', label: 'Initier un transfert de fonds', category: 'transfert' },
  { key: 'transfer.confirm', label: 'Confirmer un transfert', category: 'transfert' },
  { key: 'transfer.void', label: 'Annuler un transfert', category: 'transfert' },

  // comptabilite
  { key: 'accounting.read', label: 'Consulter la comptabilite', category: 'comptabilite' },
  { key: 'accounting.manage', label: 'Gerer la comptabilite (ecritures, comptes)', category: 'comptabilite' },

  // depense
  { key: 'expense.read', label: 'Voir les depenses', category: 'depense' },
  { key: 'expense.create', label: 'Saisir une depense', category: 'depense' },
  { key: 'expense.approve', label: 'Approuver une depense', category: 'depense' },
  { key: 'expense.pay', label: 'Payer une depense', category: 'depense' },
  { key: 'charge.manage', label: 'Gerer les charges recurrentes', category: 'depense' },

  // dette
  { key: 'debt.read', label: 'Voir les dettes', category: 'dette' },
  { key: 'debt.create', label: 'Creer une dette', category: 'dette' },
  { key: 'debt.update', label: 'Modifier une dette', category: 'dette' },
  { key: 'debt.pay', label: 'Enregistrer un versement de dette', category: 'dette' },
  { key: 'debt.void', label: 'Annuler une dette ou un versement', category: 'dette' },

  // finance (transverse)
  { key: 'finance.history.read', label: 'Voir l\'historique financier', category: 'finance' },
  { key: 'finance.dashboard.read', label: 'Voir les indicateurs financiers du tableau de bord', category: 'finance' },
  { key: 'headoffice.read', label: 'Voir la caisse du siege', category: 'finance' },
  { key: 'headoffice.manage', label: 'Gerer la caisse du siege', category: 'finance' },

  // agence
  { key: 'agency.read', label: 'Voir l\'agence', category: 'agence' },
  { key: 'agency.manage', label: 'Gerer les agences et leurs parametres', category: 'agence' },
  { key: 'dailyreport.read', label: 'Voir les rapports journaliers', category: 'agence' },
  { key: 'dailyreport.manage', label: 'Gerer les rapports journaliers', category: 'agence' },

  // fidelite
  { key: 'loyalty.read', label: 'Voir la fidelite clients', category: 'fidelite' },
  { key: 'loyalty.manage', label: 'Gerer les points et tarifs partenaires', category: 'fidelite' },
  { key: 'loyalty.policy.manage', label: 'Gerer la politique de fidelite', category: 'fidelite' },

  // penalite
  { key: 'penalty.read', label: 'Voir les penalites', category: 'penalite' },
  { key: 'penalty.manage', label: 'Gerer les penalites', category: 'penalite' },

  // notification
  { key: 'notification.read', label: 'Voir les notifications', category: 'notification' },
  { key: 'notification.send', label: 'Envoyer des notifications', category: 'notification' },
  { key: 'notification.settings.manage', label: 'Configurer les canaux de notification', category: 'notification' },

  // support
  { key: 'support.read', label: 'Voir les conversations support', category: 'support' },
  { key: 'support.reply', label: 'Repondre au support', category: 'support' },
  { key: 'support.assign', label: 'Assigner les conversations', category: 'support' },

  // rapport
  { key: 'dashboard.read', label: 'Voir le tableau de bord', category: 'rapport' },
  { key: 'report.read', label: 'Voir les rapports', category: 'rapport' },
  { key: 'report.export', label: 'Exporter les rapports', category: 'rapport' },

  // admin
  { key: 'position.manage', label: 'Gerer les postes', category: 'admin' },
  // Reservee au role ADMIN/SUPER_ADMIN : non assignable a un poste (rejet API).
  { key: 'permission.manage', label: 'Gerer la matrice des permissions', category: 'admin' },
  { key: 'user.manage', label: 'Gerer les utilisateurs', category: 'admin' },
  { key: 'system.config', label: 'Configurer le systeme', category: 'admin' },
  { key: 'settings.read', label: 'Voir les parametres', category: 'admin' },
  { key: 'branding.manage', label: 'Gerer la personnalisation (branding)', category: 'admin' },
  { key: 'sitestudio.manage', label: 'Gerer le studio site', category: 'admin' },
  { key: 'audit.read', label: 'Consulter le journal d\'audit', category: 'admin' },
];

// ============================================================
// POSTES SYSTEME + PRESETS
// ============================================================
// Mapping poste -> permissions par defaut. L'admin ajuste ensuite via la
// matrice. "*" = toutes les permissions du catalogue (sauf permission.manage,
// reservee au role admin).

export const POSITION_CATALOG: Array<{
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
      'client.read', 'client.create', 'client.update', 'client.contact.read',
      'kyc.read', 'kyc.validate',
      'parcel.read', 'parcel.create', 'parcel.update', 'parcel.deliver', 'parcel.archive',
      'parcelgroup.manage',
      'warehouse.read', 'warehouse.manage', 'warehouse.inventory.manage',
      'container.read', 'container.manage', 'manifest.read', 'manifest.manage',
      'carrier.read', 'transitroute.read',
      'invoice.read', 'invoice.manage', 'invoice.discount', 'invoice.export',
      'payment.read', 'payment.record', 'payment.void',
      'cashregister.read', 'cashregister.open', 'cashregister.close', 'cashregister.disburse',
      'disbursement.read', 'disbursement.create', 'disbursement.order', 'disbursement.approve',
      'transfer.read', 'transfer.initiate', 'transfer.confirm',
      'accounting.read',
      'expense.read', 'expense.create', 'expense.approve', 'expense.pay', 'charge.manage',
      'debt.read', 'debt.create', 'debt.update', 'debt.pay',
      'finance.history.read', 'finance.dashboard.read',
      'agency.read', 'agency.manage',
      'dailyreport.read', 'dailyreport.manage',
      'loyalty.read', 'penalty.read', 'penalty.manage',
      'notification.read', 'notification.send',
      'support.read', 'support.reply', 'support.assign',
      'dashboard.read', 'report.read', 'report.export',
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
      'client.read', 'client.create',
      'kyc.read',
      'parcel.read', 'parcel.create', 'parcel.update',
      'container.read', 'manifest.read',
      'payment.read',
      'cashregister.read', 'cashregister.close',
      'debt.read', 'penalty.read',
      'dailyreport.read',
      'agency.read',
      'notification.read', 'support.read',
      'dashboard.read',
    ],
  },
  {
    name: 'Comptable',
    description: 'Gestion comptable et financiere.',
    hierarchyLevel: 30,
    permissions: [
      'personnel.read',
      'payslip.read', 'payslip.generate',
      'attendance.read', 'leave.read',
      'client.read',
      'invoice.read', 'invoice.manage', 'invoice.discount', 'invoice.export',
      'payment.read', 'payment.record', 'payment.void',
      'cashregister.read', 'cashregister.open', 'cashregister.close', 'cashregister.disburse',
      'disbursement.read', 'disbursement.create', 'disbursement.approve',
      'transfer.read', 'transfer.initiate',
      'accounting.read', 'accounting.manage',
      'expense.read', 'expense.create', 'expense.approve', 'expense.pay', 'charge.manage',
      'debt.read', 'debt.create', 'debt.update', 'debt.pay', 'debt.void',
      'finance.history.read', 'finance.dashboard.read',
      'carrier.read',
      'penalty.read',
      'dailyreport.read',
      'agency.read',
      'dashboard.read', 'report.read', 'report.export',
    ],
  },
  {
    name: 'Magasinier',
    description: 'Gestion de l\'entrepot et des stocks.',
    hierarchyLevel: 40,
    permissions: [
      'parcel.read', 'parcel.update',
      'warehouse.read', 'warehouse.manage', 'warehouse.inventory.manage',
      'container.read', 'container.manage', 'manifest.read', 'manifest.manage',
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
      'parcelgroup.manage',
      'container.read', 'container.manage', 'manifest.read', 'manifest.manage',
      'warehouse.read',
      'carrier.read', 'transitroute.read',
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
      'parcelgroup.manage',
      'client.read', 'client.create', 'client.update', 'client.contact.read',
      'kyc.read',
      'invoice.read',
      'payment.read', 'payment.record',
      'cashregister.read',
      'debt.read', 'penalty.read', 'loyalty.read',
      'agency.read',
      'notification.read',
      'support.read', 'support.reply',
      'attendance.mark', 'leave.request', 'attendance.justify',
    ],
  },
  {
    name: 'Commercial',
    description: 'Prospection, gestion partenaires et tarifs partenaires.',
    hierarchyLevel: 50,
    permissions: [
      'client.read', 'client.create', 'client.update', 'client.contact.read',
      'parcel.read',
      'loyalty.read', 'loyalty.manage',
      'transitroute.read',
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

export { ADMIN_ONLY_PERMISSION_KEYS } from '../../src/domain/constants/permissions';
import { ADMIN_ONLY_PERMISSION_KEYS } from '../../src/domain/constants/permissions';

// Migration douce RBAC -> ABAC : role legacy -> poste systeme correspondant.
const LEGACY_ROLE_TO_POSITION: Record<string, string> = {
  CHEF_AGENCE: 'Chef d\'agence',
  SUPERVISEUR: 'Superviseur',
  COMPTABLE: 'Comptable',
  MAGASINIER: 'Magasinier',
  AGENT: 'Agent',
  PERSONNEL: 'Agent',
};

export async function seedPermissionsAndPositions(prisma: PrismaClient, organizationId: string) {
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

    // 3) Matrice de droits.
    // Poste nouveau : preset complet. Poste existant : union seulement (on
    // ajoute les cles du preset manquantes, on ne supprime JAMAIS — la matrice
    // d'un poste existant appartient a l'admin, pas au seed).
    const targetKeys = (pos.permissions === '*' ? Array.from(permByKey.keys()) : pos.permissions)
      .filter((k) => !ADMIN_ONLY_PERMISSION_KEYS.includes(k));
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

// Rattache les employes sans poste au poste systeme correspondant a leur role
// legacy. Ne touche jamais un employe deja positionne. Log les users actifs
// non-admin sans fiche employe (ils n'auront AUCUNE permission en mode enforce).
export async function migrateLegacyRolePositions(prisma: PrismaClient, organizationId: string) {
  const positions = await prisma.position.findMany({
    where: { organizationId, agencyId: null, isSystem: true },
    select: { id: true, name: true },
  });
  const positionByName = new Map(positions.map((p) => [p.name, p.id]));

  let attached = 0;
  for (const [role, positionName] of Object.entries(LEGACY_ROLE_TO_POSITION)) {
    const positionId = positionByName.get(positionName);
    if (!positionId) continue;
    const users = await prisma.user.findMany({
      where: { organizationId, role: role as never, isActive: true },
      select: { id: true, employee: { select: { id: true, positionId: true } } },
    });
    for (const user of users) {
      if (!user.employee || user.employee.positionId) continue;
      await prisma.employee.update({
        where: { id: user.employee.id },
        data: { positionId },
      });
      attached += 1;
    }
  }
  console.log(`Migration legacy roles: ${attached} employe(s) rattache(s) a un poste`);

  const orphans = await prisma.user.findMany({
    where: {
      organizationId,
      isActive: true,
      role: { notIn: ['SUPER_ADMIN', 'ADMIN'] },
      employee: null,
    },
    select: { id: true, email: true, role: true },
  });
  if (orphans.length > 0) {
    console.warn(
      `[PERM-WARN] ${orphans.length} user(s) actifs sans fiche employe (aucune permission en mode enforce):`,
      orphans.map((u) => `${u.email} (${u.role})`).join(', '),
    );
  }
}
