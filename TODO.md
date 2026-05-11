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

## 4. Décisions design en attente

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
