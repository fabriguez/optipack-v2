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
  { key: 'personnel.read', label: 'Voir le personnel', category: 'personnel', description: 'Consulter la liste et le profil des membres du personnel (informations RH, poste, agence assignee).' },
  { key: 'personnel.create', label: 'Creer un membre du personnel', category: 'personnel', description: 'Creer une fiche employe et generer automatiquement ses identifiants de connexion.' },
  { key: 'personnel.update', label: 'Modifier un membre du personnel', category: 'personnel', description: 'Modifier les informations d\'un membre du personnel : poste, agence, statut, coordonnees.' },
  { key: 'personnel.delete', label: 'Supprimer un membre du personnel', category: 'personnel', description: 'Desactiver ou supprimer definitivement une fiche employe. Action irreversible pour la suppression.' },
  { key: 'attendance.read', label: 'Consulter les pointages', category: 'personnel', description: 'Voir les enregistrements de pointage du personnel : arrivees, departs, absences et retards.' },
  { key: 'attendance.mark', label: 'Pointer le personnel', category: 'personnel', description: 'Enregistrer l\'entree ou la sortie d\'un employe (pointage manuel ou par le systeme).' },
  { key: 'attendance.justify', label: 'Justifier une absence/retard', category: 'personnel', description: 'Soumettre une justification pour sa propre absence ou son propre retard (employe concerné uniquement).' },
  { key: 'attendance.justify.review', label: 'Valider/rejeter une justification', category: 'personnel', description: 'Examiner et approuver ou rejeter les justifications d\'absence soumises par le personnel.' },
  { key: 'leave.read', label: 'Voir les conges', category: 'personnel', description: 'Consulter les demandes de conge du personnel (statut, dates, soldes de conges).' },
  { key: 'leave.request', label: 'Demander un conge', category: 'personnel', description: 'Soumettre une demande de conge pour soi-meme, soumise a validation par un superieur.' },
  { key: 'leave.validate', label: 'Valider un conge', category: 'personnel', description: 'Approuver ou rejeter les demandes de conge soumises par les membres du personnel.' },
  { key: 'leave.end_early', label: 'Mettre fin a un conge', category: 'personnel', description: 'Interrompre un conge en cours avant sa date de fin prevue (rappel anticipé).' },
  { key: 'sanction.read', label: 'Voir les sanctions', category: 'personnel', description: 'Consulter les sanctions disciplinaires enregistrees (avertissements, mises a pied, etc.).' },
  { key: 'sanction.manage', label: 'Gerer les sanctions', category: 'personnel', description: 'Creer, modifier ou supprimer des sanctions disciplinaires a l\'encontre d\'un membre du personnel.' },
  { key: 'schedule.manage', label: 'Gerer les plannings RH', category: 'personnel', description: 'Definir et modifier les plannings de travail du personnel (horaires, rotations, affectations).' },
  { key: 'holiday.manage', label: 'Gerer les jours non ouvres', category: 'personnel', description: 'Configurer les jours feries et les jours non ouvres applicables a l\'organisation.' },
  { key: 'review.read', label: 'Voir les evaluations', category: 'personnel', description: 'Consulter les evaluations de performance des membres du personnel.' },
  { key: 'review.manage', label: 'Gerer les evaluations', category: 'personnel', description: 'Creer, modifier et soumettre des evaluations de performance pour le personnel.' },
  { key: 'payslip.read', label: 'Voir les fiches de paie', category: 'personnel', description: 'Consulter les fiches de paie des employes (montants, cotisations, historique).' },
  { key: 'payslip.generate', label: 'Generer une fiche de paie', category: 'personnel', description: 'Produire une fiche de paie pour un employe a partir des donnees de salaire et de presence.' },
  { key: 'payroll.pay', label: 'Payer un salaire', category: 'personnel', description: 'Valider et enregistrer le versement du salaire d\'un employe (declenchement du paiement).' },

  // clients
  { key: 'client.read', label: 'Voir les clients', category: 'clients', description: 'Consulter la liste des clients et leur profil (nom, identifiant client, historique d\'activite).' },
  { key: 'client.create', label: 'Creer un client', category: 'clients', description: 'Enregistrer un nouveau client dans le systeme avec ses informations de base.' },
  { key: 'client.update', label: 'Modifier un client', category: 'clients', description: 'Modifier les informations d\'un client existant (nom, agence de rattachement, statut).' },
  { key: 'client.delete', label: 'Supprimer un client', category: 'clients', description: 'Desactiver ou supprimer definitivement un compte client. Action a utiliser avec precaution.' },
  { key: 'client.contact.read', label: 'Voir les coordonnees clients (tel, email, adresse, pieces)', category: 'clients', description: 'Donnees personnelles (PII) : telephone, email, adresse et documents d\'identite des clients. Sans cette permission, ces informations sont masquees partout dans l\'application.' },

  // kyc
  { key: 'kyc.read', label: 'Voir les verifications KYC', category: 'kyc', description: 'Consulter les dossiers de verification d\'identite soumis par les clients (documents, statut de validation).' },
  { key: 'kyc.validate', label: 'Valider/rejeter un KYC', category: 'kyc', description: 'Approuver ou rejeter un dossier KYC client apres verification des documents fournis.' },

  // colis
  { key: 'parcel.read', label: 'Voir les colis', category: 'colis', description: 'Consulter la liste des colis et leur suivi detaille (statut, historique, agences traversees).' },
  { key: 'parcel.create', label: 'Creer un colis', category: 'colis', description: 'Enregistrer un nouveau colis : expediteur, destinataire, contenu, tarif et agence de depot.' },
  { key: 'parcel.update', label: 'Modifier un colis', category: 'colis', description: 'Modifier les informations ou mettre a jour le statut d\'un colis existant.' },
  { key: 'parcel.delete', label: 'Supprimer un colis', category: 'colis', description: 'Supprimer definitivement un colis du systeme. Action irreversible, a reserver aux erreurs de saisie.' },
  { key: 'parcel.deliver', label: 'Remettre un colis', category: 'colis', description: 'Enregistrer la remise d\'un colis au destinataire et marquer l\'expedition comme livree.' },
  { key: 'parcel.archive', label: 'Archiver un colis', category: 'colis', description: 'Archiver les colis traites pour les retirer des listes actives sans les supprimer.' },
  { key: 'parcelgroup.manage', label: 'Gerer les groupes de colis', category: 'colis', description: 'Creer et gerer des regroupements de colis pour les expeditions groupees ou les offres multi-colis.' },

  // magasin
  { key: 'warehouse.read', label: 'Voir les entrepots', category: 'magasin', description: 'Consulter les entrepots, leurs emplacements et les espaces de stockage disponibles.' },
  { key: 'warehouse.manage', label: 'Gerer les entrepots', category: 'magasin', description: 'Creer, modifier ou desactiver des entrepots et configurer leurs emplacements de stockage.' },
  { key: 'warehouse.inventory.manage', label: 'Gerer les inventaires', category: 'magasin', description: 'Effectuer les inventaires de l\'entrepot : comptages, ajustements de stock, mouvements de marchandises.' },

  // conteneur
  { key: 'container.read', label: 'Voir les conteneurs', category: 'conteneur', description: 'Consulter les conteneurs d\'expedition, leur contenu et leur statut de transit.' },
  { key: 'container.manage', label: 'Gerer les conteneurs', category: 'conteneur', description: 'Creer et piloter les conteneurs : constitution, depart, reception entre agences, cloture.' },
  { key: 'manifest.read', label: 'Voir les manifestes', category: 'conteneur', description: 'Consulter les manifestes d\'expedition listes les colis embarques dans un conteneur.' },
  { key: 'manifest.manage', label: 'Gerer les manifestes', category: 'conteneur', description: 'Creer et modifier les manifestes d\'expedition associes aux conteneurs.' },

  // transport
  { key: 'carrier.read', label: 'Voir les transporteurs', category: 'transport', description: 'Consulter la liste des transporteurs partenaires et leurs informations de contact.' },
  { key: 'carrier.manage', label: 'Gerer les transporteurs', category: 'transport', description: 'Ajouter, modifier ou desactiver des transporteurs partenaires dans le systeme.' },
  { key: 'transitroute.read', label: 'Voir les routes de transit', category: 'transport', description: 'Consulter les routes de transit definies entre agences (trajets, delais, tarifs).' },
  { key: 'transitroute.manage', label: 'Gerer les routes de transit', category: 'transport', description: 'Creer et configurer les routes de transit inter-agences (trajets, durees estimees, responsabilites).' },

  // facturation
  { key: 'invoice.read', label: 'Voir les factures', category: 'facturation', description: 'Consulter les factures emises, leur detail (lignes, montants, statut de paiement).' },
  { key: 'invoice.manage', label: 'Gerer les factures (creer, modifier, annuler)', category: 'facturation', description: 'Creer de nouvelles factures, modifier les factures en attente et annuler des factures existantes.' },
  { key: 'invoice.discount', label: 'Appliquer une remise', category: 'facturation', description: 'Accorder une remise commerciale sur une facture (reduction du montant du au client).' },
  { key: 'invoice.export', label: 'Exporter les factures (PDF/XLSX)', category: 'facturation', description: 'Telecharger les factures au format PDF ou exporter la liste en feuille de calcul XLSX.' },

  // paiement
  { key: 'payment.read', label: 'Voir les paiements', category: 'paiement', description: 'Consulter les paiements enregistres (montant, mode, date, reference de facture).' },
  { key: 'payment.record', label: 'Enregistrer un paiement', category: 'paiement', description: 'Encaisser un paiement client et l\'associer a une ou plusieurs factures.' },
  { key: 'payment.void', label: 'Annuler un paiement', category: 'paiement', description: 'Annuler un paiement enregistre par erreur. Le solde de la facture est automatiquement recalcule.' },

  // caisse
  { key: 'cashregister.read', label: 'Voir la caisse', category: 'caisse', description: 'Consulter l\'etat de la caisse : solde, mouvements entrants et sortants de la session.' },
  { key: 'cashregister.open', label: 'Ouvrir la caisse', category: 'caisse', description: 'Demarrer une session de caisse en debut de journee avec le fond de caisse initial.' },
  { key: 'cashregister.close', label: 'Cloturer la caisse', category: 'caisse', description: 'Fermer la session de caisse, valider le recap et generer le rapport de cloture journalier.' },
  { key: 'cashregister.disburse', label: 'Decaisser depuis la caisse', category: 'caisse', description: 'Effectuer une sortie d\'especes directement depuis la caisse (decaissement immediat).' },

  // decaissement
  { key: 'disbursement.read', label: 'Voir les decaissements', category: 'decaissement', description: 'Consulter les bons de decaissement emis (beneficiaire, montant, statut d\'approbation).' },
  { key: 'disbursement.create', label: 'Creer un bon de decaissement', category: 'decaissement', description: 'Emettre un bon de decaissement pour une sortie de fonds a approuver (achat, remboursement, etc.).' },
  { key: 'disbursement.order', label: 'Ordonner une depense', category: 'decaissement', description: 'Etre designe comme ordonnateur d\'un decaissement : valider que la depense est justifiee avant approbation comptable.' },
  { key: 'disbursement.approve', label: 'Approuver un decaissement', category: 'decaissement', description: 'Donner l\'approbation finale a un bon de decaissement avant son reglement effectif.' },
  { key: 'disbursement.void', label: 'Annuler un decaissement', category: 'decaissement', description: 'Annuler un bon de decaissement non encore regle. Action reservee aux responsables finances.' },

  // transfert
  { key: 'transfer.read', label: 'Voir les transferts de fonds', category: 'transfert', description: 'Consulter les transferts de fonds entre agences (montant, agences source/destination, statut).' },
  { key: 'transfer.initiate', label: 'Initier un transfert de fonds', category: 'transfert', description: 'Creer un ordre de transfert de fonds depuis l\'agence source vers une agence destinataire.' },
  { key: 'transfer.confirm', label: 'Confirmer un transfert', category: 'transfert', description: 'Accuser reception et confirmer l\'encaissement d\'un transfert de fonds cote agence destinataire.' },
  { key: 'transfer.void', label: 'Annuler un transfert', category: 'transfert', description: 'Annuler un transfert de fonds non encore confirme par l\'agence destinataire.' },

  // comptabilite
  { key: 'accounting.read', label: 'Consulter la comptabilite', category: 'comptabilite', description: 'Acceder au grand livre comptable et consulter les ecritures, soldes de comptes et journaux.' },
  { key: 'accounting.manage', label: 'Gerer la comptabilite (ecritures, comptes)', category: 'comptabilite', description: 'Saisir des ecritures comptables, passer des extournes et gerer le plan de comptes.' },

  // depense
  { key: 'expense.read', label: 'Voir les depenses', category: 'depense', description: 'Consulter les depenses enregistrees (nature, montant, piece justificative, statut de validation).' },
  { key: 'expense.create', label: 'Saisir une depense', category: 'depense', description: 'Enregistrer une nouvelle depense avec sa nature, son montant et sa piece justificative.' },
  { key: 'expense.approve', label: 'Approuver une depense', category: 'depense', description: 'Valider une depense en attente pour autoriser son reglement.' },
  { key: 'expense.pay', label: 'Payer une depense', category: 'depense', description: 'Enregistrer le reglement effectif d\'une depense approuvee (sortie de caisse ou virement).' },
  { key: 'charge.manage', label: 'Gerer les charges recurrentes', category: 'depense', description: 'Configurer et gerer les charges fixes recurrentes de l\'agence (loyers, abonnements, contrats).' },

  // dette
  { key: 'debt.read', label: 'Voir les dettes', category: 'dette', description: 'Consulter les dettes enregistrees (clients, employes ou transporteurs) et leur historique de versements.' },
  { key: 'debt.create', label: 'Creer une dette', category: 'dette', description: 'Enregistrer une nouvelle dette a la charge d\'un client, d\'un employe ou d\'un transporteur.' },
  { key: 'debt.update', label: 'Modifier une dette', category: 'dette', description: 'Corriger ou mettre a jour les informations d\'une dette existante (montant, echeance, notes).' },
  { key: 'debt.pay', label: 'Enregistrer un versement de dette', category: 'dette', description: 'Saisir un remboursement partiel ou total sur une dette en cours.' },
  { key: 'debt.void', label: 'Annuler une dette ou un versement', category: 'dette', description: 'Annuler une dette (abandon de creance) ou invalider un versement enregistre par erreur.' },

  // finance (transverse)
  { key: 'finance.history.read', label: 'Voir l\'historique financier', category: 'finance', description: 'Acceder a l\'historique consolide de tous les flux financiers de l\'agence (synthese multi-periodes).' },
  { key: 'finance.dashboard.read', label: 'Voir les indicateurs financiers du tableau de bord', category: 'finance', description: 'Voir les KPIs financiers dans le tableau de bord : chiffre d\'affaires, encaissements, soldes et flux de tresorerie.' },
  { key: 'headoffice.read', label: 'Voir la caisse du siege', category: 'finance', description: 'Consulter la caisse centrale du siege et ses mouvements inter-agences.' },
  { key: 'headoffice.manage', label: 'Gerer la caisse du siege', category: 'finance', description: 'Gerer la tresorerie du siege : depots, retraits, virements et arbitrages entre agences.' },

  // agence
  { key: 'agency.read', label: 'Voir l\'agence', category: 'agence', description: 'Consulter les informations de l\'agence : adresse, contacts, horaires, parametres operationnels.' },
  { key: 'agency.manage', label: 'Gerer les agences et leurs parametres', category: 'agence', description: 'Creer de nouvelles agences et modifier leurs parametres (localisation, contacts, configuration).' },
  { key: 'dailyreport.read', label: 'Voir les rapports journaliers', category: 'agence', description: 'Consulter les rapports journaliers d\'activite des agences (recaps envois, encaissements, incidents).' },
  { key: 'dailyreport.manage', label: 'Gerer les rapports journaliers', category: 'agence', description: 'Creer, completer et valider les rapports journaliers d\'activite de l\'agence.' },

  // fidelite
  { key: 'loyalty.read', label: 'Voir la fidelite clients', category: 'fidelite', description: 'Consulter les soldes de points de fidelite des clients et les tarifs partenaires actifs.' },
  { key: 'loyalty.manage', label: 'Gerer les points et tarifs partenaires', category: 'fidelite', description: 'Attribuer, ajuster ou retirer des points de fidelite et gerer les tarifs partenaires clients.' },
  { key: 'loyalty.policy.manage', label: 'Gerer la politique de fidelite', category: 'fidelite', description: 'Definir les regles d\'attribution et de conversion des points fidelite (seuils, ratios, expirations).' },

  // penalite
  { key: 'penalty.read', label: 'Voir les penalites', category: 'penalite', description: 'Consulter les penalites appliquees aux clients (retards de paiement, infractions, avaries).' },
  { key: 'penalty.manage', label: 'Gerer les penalites', category: 'penalite', description: 'Creer, modifier ou annuler des penalites applicables aux clients ou aux colis.' },

  // notification
  { key: 'notification.read', label: 'Voir les notifications', category: 'notification', description: 'Consulter les notifications envoyees aux clients et au personnel (historique, statut de livraison).' },
  { key: 'notification.send', label: 'Envoyer des notifications', category: 'notification', description: 'Envoyer des notifications manuelles aux clients ou au personnel (SMS, email, push).' },
  { key: 'notification.settings.manage', label: 'Configurer les canaux de notification', category: 'notification', description: 'Parametrer les canaux d\'envoi (SMS, email, push) et les modeles de messages automatiques.' },

  // support
  { key: 'support.read', label: 'Voir les conversations support', category: 'support', description: 'Consulter toutes les conversations du support client (messages, statut, historique).' },
  { key: 'support.reply', label: 'Repondre au support', category: 'support', description: 'Envoyer des messages dans les conversations support pour repondre aux demandes clients.' },
  { key: 'support.assign', label: 'Assigner les conversations', category: 'support', description: 'Attribuer une conversation support a un agent specifique ou la reassigner.' },

  // rapport
  { key: 'dashboard.read', label: 'Voir le tableau de bord', category: 'rapport', description: 'Acceder au tableau de bord principal et consulter les statistiques globales d\'activite.' },
  { key: 'report.read', label: 'Voir les rapports', category: 'rapport', description: 'Consulter les rapports d\'activite detailles (colis, finance, personnel) sur les periodes selectionnees.' },
  { key: 'report.export', label: 'Exporter les rapports', category: 'rapport', description: 'Telecharger les rapports au format PDF ou XLSX pour exploitation externe.' },

  // admin
  { key: 'position.manage', label: 'Gerer les postes', category: 'admin', description: 'Creer et configurer les postes de travail qui servent de modeles de permissions pour le personnel.' },
  // Reservee au role ADMIN/SUPER_ADMIN : non assignable a un poste (rejet API).
  { key: 'permission.manage', label: 'Gerer la matrice des permissions', category: 'admin', description: 'Modifier la matrice de permissions des postes et definir les overrides individuels. Reserve aux administrateurs du tenant — non assignable a un poste.' },
  { key: 'user.manage', label: 'Gerer les utilisateurs', category: 'admin', description: 'Gerer les comptes utilisateurs du tenant : activation, desactivation, reinitialisation des acces.' },
  { key: 'system.config', label: 'Configurer le systeme', category: 'admin', description: 'Modifier la configuration systeme avancee du tenant : devises, parametres globaux, integrations. Reserve aux administrateurs.' },
  { key: 'settings.read', label: 'Voir les parametres', category: 'admin', description: 'Consulter les parametres de configuration du tenant. Reserve aux administrateurs du tenant.' },
  { key: 'branding.manage', label: 'Gerer la personnalisation (branding)', category: 'admin', description: 'Personnaliser l\'apparence de la plateforme pour ce tenant : logo, couleurs, nom affiché. Reserve aux administrateurs.' },
  { key: 'sitestudio.manage', label: 'Gerer le studio site', category: 'admin', description: 'Configurer le site public du tenant via le studio : pages, contenu, mise en page. Reserve aux administrateurs.' },
  { key: 'audit.read', label: 'Consulter le journal d\'audit', category: 'admin', description: 'Acceder au journal d\'audit complet du tenant : toutes les actions sensibles tracees (qui, quoi, quand). Reserve aux administrateurs.' },
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

const ADMIN_ONLY_PERMISSION_KEYS: readonly string[] = ['permission.manage'];

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
