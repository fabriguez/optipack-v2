# Cahier des charges -- TransitSoftServices v2

## Application de gestion de transit aerien, maritime et terrestre

---

## 1. Objectif de l'application

Mettre en place une application professionnelle permettant de gerer l'ensemble des operations de transit (aerien, maritime et terrestre), depuis l'enregistrement des colis jusqu'a la livraison finale, incluant la gestion logistique, financiere, clients, personnel et reporting.

---

## 2. Perimetre fonctionnel

L'application couvre :

- Gestion des agences
- Gestion des magasins / entrepots
- Gestion des clients
- Gestion des colis
- Gestion des modes de transit
- Gestion des conteneurs
- Gestion des acheminements inter-agences
- Facturation et paiements
- Gestion comptable
- Gestion des dettes
- Programme de fidelite
- Notifications
- Interface client
- Gestion du personnel
- Audit et tracabilite
- Penalites de stockage

---

## 3. Modules fonctionnels detailles

### 3.1 Gestion des agences

L'application doit permettre :

- Creation d'une agence
- Modification / suppression
- Visualisation des activites par agence

Champs :

| Champ | Type | Requis |
|-------|------|--------|
| Nom de l'agence | Texte | Oui |
| Adresse complete | Texte | Oui |
| Ville | Texte | Oui |
| Pays | Texte | Oui |
| Lien Google Maps | URL | Non |
| Numero de telephone du service | Texte | Oui |
| Email | Email | Non |
| Responsable d'agence | Reference User | Oui |

### 3.2 Gestion des magasins (entrepots)

Chaque magasin est rattache a une agence.

Champs :

| Champ | Type | Requis |
|-------|------|--------|
| Nom du magasin | Texte | Oui |
| Agence de rattachement | Reference Agence | Oui |
| Emplacement precis | Texte | Oui |
| Capacite | Nombre | Non |
| Type | Enum (stockage, transit, livraison) | Oui |

Fonctions :

- Gestion des stocks de colis
- Suivi de remplissage
- Solde caisse

### 3.3 Gestion des modes de transit

Champs :

| Champ | Type | Requis |
|-------|------|--------|
| Nom du mode | Texte | Oui |
| Type de transit | Enum (Aerien / Maritime / Terrestre) | Oui |
| Cout unitaire par kilogramme | Decimal | Oui |
| Cout unitaire par volume | Decimal | Oui |
| Delai estimatif | Nombre (jours) | Oui |
| Actif / Inactif | Boolean | Oui |

### 3.4 Gestion des clients

Champs :

| Champ | Type | Requis |
|-------|------|--------|
| Nom complet | Texte | Oui |
| Email | Email | Non |
| Numero de telephone | Texte | Oui |
| Photo | Image | Non |
| Adresse | Texte | Non |
| Statut | Enum (Ordinaire / Partenaire) | Oui |
| Date d'inscription | Date | Auto |
| Score fidelite | Nombre | Auto |

Fonctionnalites :

- Historique des colis
- Historique des paiements
- Suivi des dettes

### 3.5 Gestion des colis

Champs :

| Champ | Type | Requis |
|-------|------|--------|
| Designation | Texte | Oui |
| Masse | Decimal (kg) | Oui |
| Volume | Decimal (m3) | Oui |
| Destination | Texte | Oui |
| Mode de transit | Reference Transit | Oui |
| Prix calcule automatiquement | Decimal | Auto |
| Numero de tracking | Texte (auto genere) | Auto |
| Image du colis | Image | Non |
| Code QR | Image (auto genere) | Auto |
| Client proprietaire | Reference Client | Oui |
| Destinataire | Reference Destinataire | Non |
| Magasin de stockage | Reference Magasin | Oui |
| Date d'enregistrement | Date | Auto |
| Statut du colis | Enum | Auto |

Statuts possibles :

1. En stock
2. Dans conteneur
3. En transit
4. Arrive a l'agence
5. Receptionne
6. Livre

Fonctions :

- Generation QR Code
- Impression etiquette
- Historique complet

### 3.6 Gestion des conteneurs

Champs :

| Champ | Type | Requis |
|-------|------|--------|
| Nom du conteneur | Texte | Oui |
| Type | Enum (Aerien / Maritime / Terrestre) | Oui |
| Capacite (masse / volume) | Decimal | Oui |
| Agence de depart | Reference Agence | Oui |
| Agence de destination | Reference Agence | Oui |
| Date de chargement | Date | Non |
| Date de depart | Date | Non |
| Date d'arrivee | Date | Non |
| Statut | Enum | Auto |

Statuts :

1. Non charge
2. En chargement
3. Charge
4. En transit
5. Arrive
6. Decharge

Fonctionnalites :

- Ajout de colis
- Verification de capacite
- Bordereau d'envoi automatique
- Bordereau de reception automatique
- Rapport comparatif automatique

### 3.7 Conteneur d'acheminement inter-agences

Permet le transfert interne entre villes.

Champs :

| Champ | Type | Requis |
|-------|------|--------|
| Nom | Texte | Oui |
| Conteneur parent | Reference Conteneur | Oui |
| Ville destination | Texte | Oui |
| Capacite | Decimal | Oui |
| Statut | Enum | Auto |

Fonctions :

- Redistribution apres depotage
- Mise en stock automatique

### 3.8 Cycle de vie du colis

Historique automatique a chaque etape :

1. Creation
2. Stockage
3. Chargement
4. Transit
5. Arrivee
6. Reception
7. Livraison
8. Facturation

### 3.9 Cycle de vie du conteneur

Historique automatique :

1. Creation
2. Chargement
3. Fermeture
4. Transit
5. Arrivee
6. Dechargement

---

## 4. Modules financiers

### 4.1 Facturation

Chaque colis genere une facture automatiquement apres enregistrement.

Table FACTURE :

| Champ | Type | Requis |
|-------|------|--------|
| Id facture | ID | Auto |
| Id colis | Reference Colis | Oui |
| Client + numero client | Reference Client | Oui |
| Montant total | Decimal | Auto |
| Date creation | Date | Auto |
| Statut | Enum (Non paye / Partiellement paye / Solde) | Auto |

Fonctions :

- Facture PDF
- Impression
- Paiement partiel
- Reduction
- Montant net
- Nombre d'echeances

### 4.2 Paiements (MODULE CRITIQUE)

Chaque paiement est une transaction independante et IMMUTABLE.

Table PAIEMENT :

| Champ | Type | Requis |
|-------|------|--------|
| Id paiement | ID | Auto |
| Facture_id | Reference Facture | Oui |
| Colis_id (designation) | Reference Colis | Oui |
| Agence id destination | Reference Agence | Oui |
| Remise justifiee | Decimal | Non |
| TVA | Decimal | Non |
| Montant paye | Decimal | Oui |
| Date paiement | Date | Auto |
| Mode paiement | Enum (cash / mobile money / virement) | Oui |
| Reference transaction | Texte | Auto |
| Id utilisateur | Reference User | Auto |

Regles CRITIQUES :

- Apres chaque paiement, la facture est mise a jour automatiquement avec details (designation colis, agence encaisseur, agence destination, masse/cbm, date paiement, mode paiement, montant paye, solde, remise, TVA)
- Impossible de modifier un paiement sans trace
- Un agent ne peut PAS supprimer ou modifier le montant d'un paiement
- Plusieurs agences peuvent encaisser pour un meme colis

Exemple :

```
Facture : 120 000 FCFA
Paiement 1 - Agence Douala  : 40 000 FCFA
Paiement 2 - Agence Yaounde : 30 000 FCFA
Paiement 3 - Agence Bafoussam : 50 000 FCFA
=> Statut facture : SOLDE
```

### 4.3 Caisse agence (MODULE CRITIQUE)

Chaque agence possede sa propre caisse.

Table CAISSE_AGENCE :

| Champ | Type | Requis |
|-------|------|--------|
| Agence_id | Reference Agence | Oui |
| Date ouverture | DateTime | Auto |
| Montant ouverture | Decimal | Oui |
| Entrees | Decimal | Auto |
| Sorties | Decimal | Auto |
| Solde | Decimal | Auto |
| Image | Image | Non |
| Cloture | Boolean | Manuel |

Regles :

- Chaque paiement augmente automatiquement la caisse
- Aucune donnee a entrer manuellement sauf la cloture
- La cloture est faite par le chef d'agence ou le manager via un bouton

### 4.4 Bon de decaissement

Permet d'effectuer des depenses en toute tracabilite.

Table BON_DECAISSEMENT :

| Champ | Type | Requis |
|-------|------|--------|
| Id user | Reference User | Auto |
| Designation / motif | Texte | Oui |
| Ordonnateur de la depense | Texte | Oui |
| Date decaissement | Date | Auto |
| Montant en chiffre | Decimal | Oui |
| Montant en lettre | Texte | Oui |
| Id agence decaisseuse | Reference Agence | Auto |

Regles :

- Verification du solde de caisse de l'agence avant validation
- Impossible de modifier un decaissement sans trace
- Un agent ne peut PAS supprimer ou modifier le montant
- Annulation = nouvelle ecriture inverse

### 4.5 Transfert de fonds agence vers siege

Table TRANSFERT_FONDS :

| Champ | Type | Requis |
|-------|------|--------|
| Agence source | Reference Agence | Oui |
| Siege destination | Texte | Oui |
| Montant | Decimal | Oui |
| Date | Date | Auto |
| Valide par | Reference User | Oui |
| Image de preuve | Image | Oui |

Regles :

- Impossible de modifier un transfert sans trace
- Un agent ne peut PAS supprimer ou modifier le montant
- Annulation = nouvelle ecriture inverse

Exemple :

```
Douala encaisse : 5 000 000 FCFA
Envoie siege   : 3 000 000 FCFA
=> Historique conserve
```

### 4.6 Grand livre (journal comptable)

Chaque action financiere (entree en caisse, bon de decaissement, transfert de fonds) cree une ecriture automatique.

Exemple -- Paiement recu :
- Debit : Caisse Douala
- Credit : Creance client

Table ECRITURE_COMPTABLE :

| Champ | Type | Requis |
|-------|------|--------|
| Id | ID | Auto |
| Date | Date | Auto |
| Agence | Reference Agence | Oui |
| Id user | Reference User | Auto |
| Id user ayant mene l'operation | Reference User | Oui |
| Compte debit | Texte | Oui |
| Compte credit | Texte | Oui |
| Montant | Decimal | Oui |
| Reference facture ou bon de decaissement | Texte | Oui |

### 4.7 Gestion des depenses

Champs :

| Champ | Type | Requis |
|-------|------|--------|
| Designation | Texte | Oui |
| Ordonnateur | Texte | Oui |
| Agence | Reference Agence | Oui |
| Description | Texte | Oui |
| Image du recu | Image | Non |
| Montant | Decimal | Oui |
| Date | Date | Auto |
| Document justificatif (PDF/Word) | Fichier | Non |
| Association (colis / conteneur / autre) | Texte | Non |

### 4.8 Gestion des dettes

Champs :

| Champ | Type | Requis |
|-------|------|--------|
| Creancier | Texte | Oui |
| Description | Texte | Oui |
| Mode paiement | Enum | Oui |
| Justificatif de paiement | Fichier | Non |
| Montant | Decimal | Oui |
| Date | Date | Auto |
| Nombre d'echeances | Nombre | Oui |
| Planning remboursement | JSON | Oui |
| Statut | Enum | Auto |

Fonctions :

- Suivi echeancier
- Alertes automatiques

---

## 5. Modules complementaires

### 5.1 Interface client

Le client peut :

- Se connecter
- Suivre ses colis
- Voir ses factures
- Effectuer un paiement
- Consulter sa dette
- Recevoir des notifications
- Voir nos differentes adresses
- Consulter nos services

### 5.2 Programme de fidelite

Fonctions :

- Accumulation de points
- Classement clients
- Reduction automatique
- Statut VIP

### 5.3 Notifications

Types :

- Email
- SMS
- WhatsApp

Evenements declencheurs :

- Colis enregistre
- Colis expedie
- Colis arrive
- Paiement recu
- Penalite appliquee

### 5.4 Gestion du personnel

Champs :

| Champ | Type | Requis |
|-------|------|--------|
| Nom | Texte | Oui |
| Fonction | Texte | Oui |
| Agence | Reference Agence | Oui |
| Email | Email | Oui |
| Telephone | Texte | Oui |
| Role | Enum | Oui |
| Mot de passe | Hash | Oui |

Roles :

- Admin
- Agent agence
- Comptable
- Magasinier
- Superviseur

### 5.5 Audit des utilisateurs

Historique complet de :

- Connexion
- Creation
- Modification
- Suppression
- Actions financieres
- Toute autre action

### 5.6 Livre comptable

Doit contenir :

- Entrees
- Sorties
- Depenses
- Paiements
- Dettes
- Soldes
- Agence
- Agent effectuant l'action

### 5.7 Gestion des penalites

Regle : apres 10 jours en agence de destination, penalite journaliere.

Champs :

| Champ | Type | Requis |
|-------|------|--------|
| Colis | Reference Colis | Oui |
| Nombre de jours | Nombre | Auto |
| Montant penalite | Decimal | Auto |
| Statut paye | Boolean | Auto |

---

## 6. Dashboard patron

Vue en temps reel :

- **Chiffre d'affaires total** : somme des montants transferes vers le siege par chaque agence
- **Argent en agence** : solde caisses par agence
- **Argent siege** : total transfere
- **Clients debiteurs** : montants encore dus
- **Meilleures agences** : classement par performance

---

## 7. Fonctionnalites techniques

- Tableau de bord analytique
- Statistiques par agence
- Statistiques par mode de transport
- Graphiques financiers
- Multi-devise
- Multi-langue
- Export Excel / PDF
- API mobile
- Scan QR code
- Gestion multi-agences
- Sauvegarde automatique
- Securite par roles
- Communication client-support en temps reel
- Notifications push mobile
- Animations fluides (transitions de page, skeletons)

---

## 8. Stack technique

| Composant | Technologie |
|-----------|------------|
| Monorepo | pnpm + Turborepo |
| API | Express.js, TypeScript, Clean Architecture |
| ORM | Prisma + PostgreSQL |
| Cache / Queue | Redis + BullMQ |
| Stockage fichiers | MinIO (S3-compatible) |
| Dashboard web | Next.js 16, TanStack Query, React Hook Form, ShadCN UI, Tailwind CSS |
| App mobile client | React Native, Expo, Expo Router |
| App tablette | React Native, Expo |
| Temps reel | Socket.io |
| Paiement en ligne | Stripe + Mobile Money (Orange / MTN) |
| Conteneurisation | Docker Compose |
| Deploiement | VPS (DigitalOcean / Hetzner) |
| Langue | Francais par defaut, i18n anglais |
