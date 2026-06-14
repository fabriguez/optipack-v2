export const PERMISSION_DESCRIPTIONS: Record<string, string> = {
  // personnel
  'personnel.read': 'Consulter la liste et le profil des membres du personnel (informations RH, poste, agence assignee).',
  'personnel.create': 'Creer une fiche employe et generer automatiquement ses identifiants de connexion.',
  'personnel.update': "Modifier les informations d'un membre du personnel : poste, agence, statut, coordonnees.",
  'personnel.delete': "Desactiver ou supprimer definitivement une fiche employe. Action irreversible pour la suppression.",
  'attendance.read': "Voir les enregistrements de pointage du personnel : arrivees, departs, absences et retards.",
  'attendance.mark': "Enregistrer l'entree ou la sortie d'un employe (pointage manuel ou par le systeme).",
  'attendance.justify': "Soumettre une justification pour sa propre absence ou son propre retard (employe concerne uniquement).",
  'attendance.justify.review': "Examiner et approuver ou rejeter les justifications d'absence soumises par le personnel.",
  'leave.read': "Consulter les demandes de conge du personnel (statut, dates, soldes de conges).",
  'leave.request': "Soumettre une demande de conge pour soi-meme, soumise a validation par un superieur.",
  'leave.validate': "Approuver ou rejeter les demandes de conge soumises par les membres du personnel.",
  'leave.end_early': "Interrompre un conge en cours avant sa date de fin prevue (rappel anticipe).",
  'sanction.read': "Consulter les sanctions disciplinaires enregistrees (avertissements, mises a pied, etc.).",
  'sanction.manage': "Creer, modifier ou supprimer des sanctions disciplinaires a l'encontre d'un membre du personnel.",
  'schedule.manage': "Definir et modifier les plannings de travail du personnel (horaires, rotations, affectations).",
  'holiday.manage': "Configurer les jours feries et les jours non ouvres applicables a l'organisation.",
  'review.read': "Consulter les evaluations de performance des membres du personnel.",
  'review.manage': "Creer, modifier et soumettre des evaluations de performance pour le personnel.",
  'payslip.read': "Consulter les fiches de paie des employes (montants, cotisations, historique).",
  'payslip.generate': "Produire une fiche de paie pour un employe a partir des donnees de salaire et de presence.",
  'payroll.pay': "Valider et enregistrer le versement du salaire d'un employe (declenchement du paiement).",

  // clients
  'client.read': "Consulter la liste des clients et leur profil (nom, identifiant client, historique d'activite).",
  'client.create': "Enregistrer un nouveau client dans le systeme avec ses informations de base.",
  'client.update': "Modifier les informations d'un client existant (nom, agence de rattachement, statut).",
  'client.delete': "Desactiver ou supprimer definitivement un compte client. Action a utiliser avec precaution.",
  'client.contact.read': "Donnees personnelles (PII) : telephone, email, adresse et documents d'identite des clients. Sans cette permission, ces informations sont masquees partout dans l'application.",

  // kyc
  'kyc.read': "Consulter les dossiers de verification d'identite soumis par les clients (documents, statut de validation).",
  'kyc.validate': "Approuver ou rejeter un dossier KYC client apres verification des documents fournis.",

  // colis
  'parcel.read': "Consulter la liste des colis et leur suivi detaille (statut, historique, agences traversees).",
  'parcel.create': "Enregistrer un nouveau colis : expediteur, destinataire, contenu, tarif et agence de depot.",
  'parcel.update': "Modifier les informations ou mettre a jour le statut d'un colis existant.",
  'parcel.delete': "Supprimer definitivement un colis du systeme. Action irreversible, a reserver aux erreurs de saisie.",
  'parcel.deliver': "Enregistrer la remise d'un colis au destinataire et marquer l'expedition comme livree.",
  'parcel.archive': "Archiver les colis traites pour les retirer des listes actives sans les supprimer.",
  'parcelgroup.manage': "Creer et gerer des regroupements de colis pour les expeditions groupees ou les offres multi-colis.",

  // magasin
  'warehouse.read': "Consulter les entrepots, leurs emplacements et les espaces de stockage disponibles.",
  'warehouse.manage': "Creer, modifier ou desactiver des entrepots et configurer leurs emplacements de stockage.",
  'warehouse.inventory.manage': "Effectuer les inventaires de l'entrepot : comptages, ajustements de stock, mouvements de marchandises.",

  // conteneur
  'container.read': "Consulter les conteneurs d'expedition, leur contenu et leur statut de transit.",
  'container.manage': "Creer et piloter les conteneurs : constitution, depart, reception entre agences, cloture.",
  'manifest.read': "Consulter les manifestes d'expedition listant les colis embarques dans un conteneur.",
  'manifest.manage': "Creer et modifier les manifestes d'expedition associes aux conteneurs.",

  // transport
  'carrier.read': "Consulter la liste des transporteurs partenaires et leurs informations de contact.",
  'carrier.manage': "Ajouter, modifier ou desactiver des transporteurs partenaires dans le systeme.",
  'transitroute.read': "Consulter les routes de transit definies entre agences (trajets, delais, tarifs).",
  'transitroute.manage': "Creer et configurer les routes de transit inter-agences (trajets, durees estimees, responsabilites).",

  // facturation
  'invoice.read': "Consulter les factures emises, leur detail (lignes, montants, statut de paiement).",
  'invoice.manage': "Creer de nouvelles factures, modifier les factures en attente et annuler des factures existantes.",
  'invoice.discount': "Accorder une remise commerciale sur une facture (reduction du montant du au client).",
  'invoice.export': "Telecharger les factures au format PDF ou exporter la liste en feuille de calcul XLSX.",

  // paiement
  'payment.read': "Consulter les paiements enregistres (montant, mode, date, reference de facture).",
  'payment.record': "Encaisser un paiement client et l'associer a une ou plusieurs factures.",
  'payment.void': "Annuler un paiement enregistre par erreur. Le solde de la facture est automatiquement recalcule.",

  // caisse
  'cashregister.read': "Consulter l'etat de la caisse : solde, mouvements entrants et sortants de la session.",
  'cashregister.open': "Demarrer une session de caisse en debut de journee avec le fond de caisse initial.",
  'cashregister.close': "Fermer la session de caisse, valider le recap et generer le rapport de cloture journalier.",
  'cashregister.disburse': "Effectuer une sortie d'especes directement depuis la caisse (decaissement immediat).",

  // decaissement
  'disbursement.read': "Consulter les bons de decaissement emis (beneficiaire, montant, statut d'approbation).",
  'disbursement.create': "Emettre un bon de decaissement pour une sortie de fonds a approuver (achat, remboursement, etc.).",
  'disbursement.order': "Etre designe comme ordonnateur d'un decaissement : valider que la depense est justifiee avant approbation comptable.",
  'disbursement.approve': "Donner l'approbation finale a un bon de decaissement avant son reglement effectif.",
  'disbursement.void': "Annuler un bon de decaissement non encore regle. Action reservee aux responsables finances.",

  // transfert
  'transfer.read': "Consulter les transferts de fonds entre agences (montant, agences source/destination, statut).",
  'transfer.initiate': "Creer un ordre de transfert de fonds depuis l'agence source vers une agence destinataire.",
  'transfer.confirm': "Accuser reception et confirmer l'encaissement d'un transfert de fonds cote agence destinataire.",
  'transfer.void': "Annuler un transfert de fonds non encore confirme par l'agence destinataire.",

  // comptabilite
  'accounting.read': "Acceder au grand livre comptable et consulter les ecritures, soldes de comptes et journaux.",
  'accounting.manage': "Saisir des ecritures comptables, passer des extournes et gerer le plan de comptes.",

  // depense
  'expense.read': "Consulter les depenses enregistrees (nature, montant, piece justificative, statut de validation).",
  'expense.create': "Enregistrer une nouvelle depense avec sa nature, son montant et sa piece justificative.",
  'expense.approve': "Valider une depense en attente pour autoriser son reglement.",
  'expense.pay': "Enregistrer le reglement effectif d'une depense approuvee (sortie de caisse ou virement).",
  'charge.manage': "Configurer et gerer les charges fixes recurrentes de l'agence (loyers, abonnements, contrats).",

  // dette
  'debt.read': "Consulter les dettes enregistrees (clients, employes ou transporteurs) et leur historique de versements.",
  'debt.create': "Enregistrer une nouvelle dette a la charge d'un client, d'un employe ou d'un transporteur.",
  'debt.update': "Corriger ou mettre a jour les informations d'une dette existante (montant, echeance, notes).",
  'debt.pay': "Saisir un remboursement partiel ou total sur une dette en cours.",
  'debt.void': "Annuler une dette (abandon de creance) ou invalider un versement enregistre par erreur.",

  // finance
  "finance.history.read": "Acceder a l'historique consolide de tous les flux financiers de l'agence (synthese multi-periodes).",
  "finance.dashboard.read": "Voir les KPIs financiers dans le tableau de bord : chiffre d'affaires, encaissements, soldes et flux de tresorerie.",
  'headoffice.read': "Consulter la caisse centrale du siege et ses mouvements inter-agences.",
  'headoffice.manage': "Gerer la tresorerie du siege : depots, retraits, virements et arbitrages entre agences.",

  // agence
  'agency.read': "Consulter les informations de l'agence : adresse, contacts, horaires, parametres operationnels.",
  'agency.manage': "Creer de nouvelles agences et modifier leurs parametres (localisation, contacts, configuration).",
  'dailyreport.read': "Consulter les rapports journaliers d'activite des agences (recaps envois, encaissements, incidents).",
  'dailyreport.manage': "Creer, completer et valider les rapports journaliers d'activite de l'agence.",

  // fidelite
  'loyalty.read': "Consulter les soldes de points de fidelite des clients et les tarifs partenaires actifs.",
  'loyalty.manage': "Attribuer, ajuster ou retirer des points de fidelite et gerer les tarifs partenaires clients.",
  'loyalty.policy.manage': "Definir les regles d'attribution et de conversion des points fidelite (seuils, ratios, expirations).",

  // penalite
  'penalty.read': "Consulter les penalites appliquees aux clients (retards de paiement, infractions, avaries).",
  'penalty.manage': "Creer, modifier ou annuler des penalites applicables aux clients ou aux colis.",

  // notification
  'notification.read': "Consulter les notifications envoyees aux clients et au personnel (historique, statut de livraison).",
  'notification.send': "Envoyer des notifications manuelles aux clients ou au personnel (SMS, email, push).",
  'notification.settings.manage': "Parametrer les canaux d'envoi (SMS, email, push) et les modeles de messages automatiques.",

  // support
  'support.read': "Consulter toutes les conversations du support client (messages, statut, historique).",
  'support.reply': "Envoyer des messages dans les conversations support pour repondre aux demandes clients.",
  'support.assign': "Attribuer une conversation support a un agent specifique ou la reassigner.",

  // rapport
  'dashboard.read': "Acceder au tableau de bord principal et consulter les statistiques globales d'activite.",
  'report.read': "Consulter les rapports d'activite detailles (colis, finance, personnel) sur les periodes selectionnees.",
  'report.export': "Telecharger les rapports au format PDF ou XLSX pour exploitation externe.",

  // admin
  'position.manage': "Creer et configurer les postes de travail qui servent de modeles de permissions pour le personnel.",
  'permission.manage': "Modifier la matrice de permissions des postes et definir les overrides individuels. Reserve aux administrateurs du tenant.",
  'user.manage': "Gerer les comptes utilisateurs du tenant : activation, desactivation, reinitialisation des acces.",
  'system.config': "Modifier la configuration systeme avancee du tenant : devises, parametres globaux, integrations.",
  'settings.read': "Consulter les parametres de configuration du tenant. Reserve aux administrateurs du tenant.",
  'branding.manage': "Personnaliser l'apparence de la plateforme pour ce tenant : logo, couleurs, nom affiche.",
  'sitestudio.manage': "Configurer le site public du tenant via le studio : pages, contenu, mise en page.",
  'audit.read': "Acceder au journal d'audit complet du tenant : toutes les actions sensibles tracees (qui, quoi, quand).",
};
