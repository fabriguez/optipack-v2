# TODO — Travaux différés

Toutes ces tâches ont été planifiées au cours de sessions précédentes mais reportées
explicitement. Ordre = priorité approximative décroissante, mais à confirmer au moment
d'attaquer chaque bloc.

---

## 1. Dette — Phase 2 (suite de la refonte typée)

La Phase 1 a livré : modèle Debt typé (CLIENT/EMPLOYEE/AGENCY/CARRIER), DebtPayment
avec justificatif, DebtHistory (audit), modèle Carrier, UI 2 onglets + détail timeline.

**À faire ensuite :**

- **Auto-création de dette** :
  - Au retrait colis sans paiement intégral → créer une `Debt` de type `CLIENT`
    (link parcelId + invoiceId + clientId, montant = facture.balance restant).
  - À l'avance sur salaire (PayEmployee depuis caisse > salaire dû) → créer
    `Debt` type `EMPLOYEE`.
  - À la charge agence non réglée à l'échéance → créer `Debt` type `AGENCY`
    avec `agencyChargeId`.
- **Pénalités automatiques** : cron quotidien qui passe les dettes en `OVERDUE`
  quand `nextDueDate` ou `dueDateFinal` dépasse aujourd'hui, et applique
  optionnellement une pénalité (% configurable du remainingAmount).
- **Blocage retrait colis** : si client a une dette > seuil configurable
  (`SystemConfig` clé `debt.blockPickupThreshold`), refuser
  `HandoverParcelUseCase` jusqu'à résolution (paiement ou override admin avec motif).
- **Relances multi-canal** : étendre `checkDebtAlerts` (cron) pour envoyer
  SMS / WhatsApp / email selon `Client.notificationPreferences` ou défaut
  organisation. Texte template : "Votre dette de X FCFA liée au colis Y arrive
  à échéance le Z".
- **Dashboard dette** : nouvelle page `/debts/dashboard` avec :
  - Total dettes par bucket (client vs entreprise).
  - Total par agence.
  - Top 10 plus gros débiteurs / créanciers.
  - Dettes échues vs à échoir (timeline 7/30/90 jours).
  - Taux de remboursement = total payé / total créé sur N derniers jours.
- **Export XLSX** dette + détail colis lié (tracking, montant transport,
  magasinage, avances, pénalités) — réutiliser `ExcelService.generate`.
- **Permission `debt.cancel` / `debt.adjust`** explicites dans le seed (déjà
  forcées sur les routes par `authorize('SUPER_ADMIN','ADMIN')`, mais à exposer
  pour mapper sur des positions custom).
- **Migration de données** si dettes existantes en prod : remplir `reference`
  (générer un `DET-NNNN` rétroactif), `agencyId` (déduire via `invoice.agencyId`),
  `organizationId` (déduire via `agency.organizationId`), `motif` (copier
  `description` ou fallback "Dette legacy").

## 2. Décaissement — finir la refonte

Schéma Prisma déjà étendu (colonnes optionnelles ajoutées à `DisbursementVoucher` :
`ordererUserId`, `proofKey`, `justificationDescription`, `containerId`, `parcelId`,
`clientId`, relations back). Permission `disbursement.order` / `disbursement.create`
déjà dans `seed.ts`.

**Reste à faire :**

- Étendre `createDisbursementSchema` (shared) pour exposer : `proofUrl`/`proofKey`,
  `ordererUserId`, `containerId`/`parcelId`/`clientId`, `justificationDescription`.
- Mettre à jour `CreateDisbursementUseCase` pour persister les nouveaux champs.
- Endpoint `/employees/orderers?permission=disbursement.order` (ou filtre
  générique sur `/employees?permission=…`) qui retourne les employés
  éligibles comme ordonnateurs.
- Form `DisbursementFormDialog` :
  - ImageInput (ou file picker accept image+PDF) pour la pièce justificative,
    upload via `uploadFile` → `proofUrl`/`proofKey`.
  - `AppSearchSelect` "Ordonnateur" alimenté par le nouvel endpoint
    (admin peut s'auto-désigner via une option dédiée).
  - 3 `AppSearchSelect` optionnels : Conteneur / Colis / Client (pour
    remboursement ou imputation).
  - Champ texte `justificationDescription` (commentaire libre).
- Page `/disbursements` :
  - Filtre date/heure/période (from/to) via picker, persisté en query params.
  - Affichage de l'ordonnateur (`ordererUser.fullName` ou `orderer` texte fallback).
  - Lien cliquable vers le tiers lié (conteneur/colis/client) dans la table.

## 3. Frais de magasinage — matrice configurable

État actuel : `warehouse.storageFreeDays` + `warehouse.storageDailyRate` (taux flat
par magasin). `ComputeStorageFeeUseCase` calcule (jours - free) × rate.

**Cible :**

- Nouveau modèle `StorageFeePolicy` : multi-dimensionnel
  - `transitRouteId` (route de transit appliquée — AIR/SEA/LAND ou
    route précise)
  - `parcelCategory` (STANDARD/DOCUMENT/FOOD/ELECTRONICS/CLOTHING/OTHER)
  - `massBracketMin`/`massBracketMax` (kg) — null = pas de borne
  - `volumeBracketMin`/`volumeBracketMax` (m³) — null = pas de borne
  - `freeUnitCount` (nombre d'unités gratuites)
  - `chargedUnitRate` (tarif par unité après la franchise)
  - `unitType` enum `DAY | WEEK | MONTH`
  - `progressionType` enum `LINEAR | STEPPED | EXPONENTIAL`
  - `progressionConfig` JSON (paliers ou facteurs selon type)
  - `validFrom` / `validUntil`
- Use case `FindBestPolicyUseCase(parcelId, asOf)` : matche par
  (route, catégorie, masse, volume) avec spécificité décroissante,
  retourne la meilleure correspondance.
- Use case `ComputeStorageFeeV2UseCase` qui remplace l'actuel et utilise
  la matrice. Fallback sur ancien calcul si aucune policy ne matche
  (rétro-compat magasins existants).
- Page admin `/settings/storage-fees` :
  - Matrice CRUD (table avec filtres par route + catégorie).
  - Simulateur : "Pour colis X kg/m³ sur route Y catégorie Z, après N jours,
    coût = …".
- Migration de données : seed une policy par magasin existant avec ses
  `storageFreeDays`/`storageDailyRate` actuels (catégorie ANY, masse ANY,
  volume ANY).

## 4. Paiements — refonte du form + liste

**Form `PaymentFormDialog` :**

- **Filtre facture intelligent** : remplacer le `AppSelect` actuel par un
  `AppSearchSelect` qui filtre par : numéro de facture, nom client, numéro
  client (téléphone), ou tracking colis. Endpoint backend à étendre :
  `/invoices?search=...` doit chercher dans `reference`, `client.fullName`,
  `client.phone`, `parcels.trackingNumber`.
- **Sélection du colis (optionnelle)** : si la facture couvre plusieurs colis,
  permettre de scoper le paiement sur un colis précis (au lieu de tout
  proportionnellement). Impact : ajouter `parcelId?` sur `Payment` + use case
  pour répartir l'avance différemment.
- **Modes de paiement en select strict** : déjà des options ; bien valider que
  `paymentMethod` est `z.enum([...])` côté schema et option list ferme côté UI
  (pas de texte libre). À vérifier : actuellement c'est déjà le cas mais
  l'enum n'est pas réexporté depuis `@transitsoftservices/shared`.
- **Upload justificatifs (multi)** :
  - Ajouter un champ multi-fichiers (images + PDF) avec capture caméra
    (`<input type="file" accept="image/*,application/pdf" capture multiple>`).
  - Uploader chaque fichier via `uploadFile` puis persister sur le paiement.
  - Nécessite migration Prisma : nouvelle table `PaymentAttachment`
    (`paymentId`, `url`, `key`, `kind` IMAGE|PDF, `caption?`, `createdAt`).
- **Liste paiements** :
  - Colonne "Colis" cliquable affichant le(s) tracking number(s) liés via
    la facture, ou directement via le futur `parcelId` du paiement.
  - Filtres : par tracking colis, par mode, période.

## 5. Transfert de fonds — fix & extensions

État actuel : modèle `FundTransfer` avec `paymentMethod`, validation à 2 étapes
(initiate + confirm). La confirmation est rapportée KO par l'utilisateur.

**À faire :**

- **Reproduire et fixer la confirmation** : analyser `ConfirmFundTransferUseCase`
  pour comprendre pourquoi elle ne passe pas (probablement permission, statut
  source, ou solde caisse destination). Ajouter logs explicites des conditions
  de rejet.
- **Source** : déjà une agence ; ajouter `sourcePaymentMethod` (CASH, MOMO,
  VIREMENT...). Permet de tracer d'où sort l'argent (caisse vs compte
  bancaire) au sein de la même agence.
- **Destination** : symmétrique — `destinationPaymentMethod` (où va l'argent
  côté destination). Permet "caisse → compte bancaire", "MoMo → caisse", etc.
- **Filtres liste `/fund-transfers`** :
  - Référence (search exact)
  - Agence source (search-select)
  - Agence destination (search-select)
  - Statut (PENDING / CONFIRMED / REJECTED)
  - Date / heure / période (from / to datepicker)
  - Mode source + mode destination (multi-select)
  - Montant (min / max)

## 6. Livre comptable — lignes cliquables + actor + détails

État actuel : `JournalEntry` listé avec ligne sommaire ; pas de lien vers le
détail, pas d'attribut "qui a fait l'opération" visible.

**À faire :**

- Stocker / exposer `createdByUserId` sur `JournalEntry` (déjà présent dans
  schema, à exposer dans l'API list + UI).
- Chaque ligne dans `/accounting` → cliquable, route vers
  `/accounting/journal/[id]` qui montre :
  - Description complète.
  - Toutes les écritures (debit / credit / compte / montant).
  - Source liée (`Disbursement` / `Payment` / `Expense` / etc.) → lien cliquable.
  - User créateur + date heure.
  - Note de réconciliation s'il existe.

## 7. Magasin — imports/exports + inventaire + flux stock

**Imports/exports en XLSX (pas CSV)** :
- Remplacer tous les imports/exports magasin (parcels list, manifestes,
  inventaires) par du XLSX via `ExcelService.generate` / `.parse`.
- Couvrir tous les champs de création (designation, weight, volume, category,
  isFragile, isHazardous, destinationAgencyId, destinationAddress, clientId,
  recipientId, warehouseId, transitRouteId, declaredValue, observation,
  trackingFournisseur, …). Aujourd'hui les imports CSV ne couvrent qu'un
  sous-ensemble.

**Règle d'admission au stock** : seuls les colis suivants doivent apparaître
comme "en stock" dans un magasin :
- Créés directement (créateur attribue warehouseId).
- Reçus d'un conteneur (dechargement → warehouseId destination).
- Découverts comme "extra physique" lors d'un inventaire (créés via
  `RegisterExtraManifestParcelUseCase` ou équivalent inventaire).
→ Auditer toutes les sources de "Parcel.warehouseId" et bloquer les autres
chemins (ex: import qui crée des parcels sans flux d'entrée explicite doit
les marquer LOST ou en erreur).

**Module inventaire** : aujourd'hui ne fonctionne pas (scan, sélection manuelle
des colis trouvés, clôture).

Refonte demandée :
- Démarrer un inventaire → fige les colis attendus (snapshot).
- Scanner colis présent → marque l'item correspondant `scanned = true`.
- Sélection manuelle (caméra HS) → marque `markedManually = true`.
- Détection automatique de "extra physique" (scan d'un tracking inattendu) →
  permet de créer la fiche colis en flux d'entrée.
- Clôture → génère un rapport PDF immuable listant :
  - Colis attendus / scannés / non scannés / extra.
  - Écarts (MISSING / EXTRA) avec motif.
  - Total : nombre, valeur, masse.
  - Signature numérique du clôturant.

**Stock display mismatch** : le compteur "Colis en magasin" dans la liste
diffère de la page détail. Source : filtres distincts (list utilise un
`_count.parcels`, detail filtre `isPresent && status IN_STOCK|RECEIVED &&
!isArchived`). Aligner sur le filtre détail (déjà fait pour `_count` mais
re-vérifier sur la list page).

**Actions stock** :
- Permettre de retirer un colis du stock depuis l'UI (UnloadParcel /
  manuallyRemove) — actuellement bloqué.
- Permettre de transférer un colis entre magasins (même agence) ou inter-agence.
- Permettre la modification directe du colis depuis sa fiche stock.
- **Règle de sortie** : retrait définitif (handover) uniquement si la facture
  est totalement soldée (`balance = 0`) OU validation explicite par
  SUPER_ADMIN avec motif obligatoire. Voir le bloc dette Phase 2 pour le
  blocage auto.

## 8. Client — image à la création + import XLSX complet

- **Image client à la création** : le formulaire de création client ne permet
  pas d'uploader l'image (existe sur l'édition). Ajouter `ImageInput` dans
  `ClientFormDialog` (mode create) + persister avec `imageUrl`/`imageKey`.
  Note : la CNI est déjà uploadable, c'est la photo profil qui manque.
- **Import / export client en XLSX** : convertir le CSV existant, et couvrir
  tous les champs : fullName, phone, email, address, agencyId, clientType,
  cniRectoUrl, cniVersoUrl, photoUrl, notes, ... (idem schema création).
  Réutiliser `ExcelService.generate/.parse` avec images embarquées.

## 9. Portail public — OAuth Google / Apple / Facebook

UI déjà en place : [SocialAuthButtons](apps/web-client/components/auth/SocialAuthButtons.tsx)
sur les pages login + register, avec un toast "bientôt disponible" sur clic.

**À faire backend pour passer en vraie auth :**

- Endpoint `GET /api/v1/client-portal/oauth/<provider>/start?intent=login|register`
  qui redirige vers la consent screen du provider avec le bon `client_id` et
  `redirect_uri`. Conserver l'`intent` dans le state OAuth.
- Endpoint `GET /api/v1/client-portal/oauth/<provider>/callback` qui :
  - échange le code contre un token chez le provider ;
  - récupère l'identité (email, sub, nom complet, photo) ;
  - cherche un `Client` existant via `oauthAccounts` (nouveau modèle) ;
  - si trouvé → login ; sinon → crée le client + lie l'OAuth account ;
  - émet un JWT portail (`type: 'client'`) et redirige vers `/`.
- Nouveau modèle Prisma `ClientOAuthAccount` : `clientId`, `provider` (enum
  GOOGLE | APPLE | FACEBOOK), `providerUserId`, `email`, `accessToken?`,
  `refreshToken?`, `expiresAt?`, `linkedAt`.
- Env vars : `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`,
  `APPLE_OAUTH_*`, `FACEBOOK_OAUTH_*`, `OAUTH_REDIRECT_BASE_URL`.
- Côté frontend : remplacer `handleClick` dans `SocialAuthButtons` par
  `window.location.href = '/api/v1/client-portal/oauth/<provider>/start'`.
- Account linking : si un client connecté ajoute un provider OAuth, lier au
  compte existant (UI `/account/security`).

## 10. Décisions design en attente

- **Inventaire : que faire des colis "extra physique" trouvés au scan ?**
  Création silencieuse en stock OU obligation de passer par un workflow
  RegisterExtra avec validation chef d'agence ? Différence : audit vs vitesse.
- **Identifier les magasins admis pour stockage à la livraison** : si
  livraison directe sans passage en magasin (RECEIVED skip), comment
  facturer le magasinage ? Probable : `daysInWarehouse = 0` → fee = 0.
  À valider avec le user avant de figer.
- **Politique de pénalités sur dette CLIENT** : actuellement aucune ;
  Phase 2 doit définir si on ajoute un montant supplémentaire à
  `totalAmount` (= modifier la dette) ou si on crée une dette séparée
  type CLIENT motif "Pénalité retard". Affecte la traçabilité.
- **Carrier** : un transporteur peut-il avoir plusieurs comptes
  (bénéfices, dettes, paiements anticipés) ? Si oui, modèle
  `CarrierAccount` à prévoir. Sinon on agrège tout sur `Carrier`.

---

## SMTP direct depuis VPS (alternative à Resend)

Activer l'envoi mail SMTP natif depuis le VPS au lieu de passer par Resend.
Utile si : volume gros (>3k/mois/tenant), coût Resend trop élevé, contraintes
souveraineté/data residency, ou simple envie de contrôle.

**DNS** :
- `rDNS` (PTR) chez l'hébergeur : `IP_VPS` → `mail.tondomaine.com`
- `A` : `mail.tondomaine.com` → `IP_VPS` (round-trip cohérent obligatoire)
- `SPF` : `TXT @  v=spf1 ip4:IP_VPS ~all`
- `DKIM` : générer paire via `opendkim-genkey`, publier la pub en
  `TXT default._domainkey  v=DKIM1; k=rsa; p=...`
- `DMARC` : `TXT _dmarc  v=DMARC1; p=quarantine; rua=mailto:dmarc@tondomaine.com`

**Serveur** :
- Installer Postfix (ou OpenSMTPD) sur le VPS
- HELO/EHLO = `mail.tondomaine.com` (doit matcher rDNS exactement)
- TLS obligatoire (Let's Encrypt cert)
- UFW : `ufw allow 25/tcp 465/tcp 587/tcp`
- Vérifier port 25 sortant pas bloqué par l'hébergeur (OVH/DO bloquent
  par défaut, Hetzner ouvre sur demande, Contabo ouvre nativement)

**Code** :
- `EmailService` route déjà via `TenantEmailDispatcher` (cascade tenant→
  shared). Ajouter un nouveau provider `VpsSmtpProvider` à côté de
  `ResendProvider` / `SharedSmtpProvider`. Choix via
  `Organization.emailConfig.provider = 'vps-smtp'`.

**Validation** :
- Test deliverability : `mail-tester.com` (cible >9/10)
- Audit DNS : `mxtoolbox.com SuperTool`
- Warm-up IP : commencer petit volume, monter progressivement (sinon spam
  folder Gmail/Outlook le premier mois)
