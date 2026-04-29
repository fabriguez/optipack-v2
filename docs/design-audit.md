# Audit conception OptiPack v2

Analyse critique des choix de modélisation et de la sémantique métier.
Document vivant à mettre à jour au fil des décisions.

---

## 1. Destination des colis (sémantique)

### État actuel

`Parcel.destination` est une **string libre** (ex: "Yaoundé", "Douala-Bonanjo"), saisie à la main pour chaque colis.

### Problèmes

| # | Problème | Impact |
|---|---|---|
| 1.1 | Redondant avec `TransitRoute.arrivalCity` | Double saisie, source de vérité unclear |
| 1.2 | Pas typo-proof | "Yaoundé" / "Yaounde" / "YDE" → trois entrées différentes en base |
| 1.3 | Pas requêtable | Impossible de faire "tous les colis vers Yaoundé" sans `LIKE` sur du texte |
| 1.4 | Pas d'agence rattachée | Aucun lien avec le point physique de réception |

### Proposition

```prisma
model Parcel {
  // ...
  destinationAgencyId String?    // Agence qui reçoit physiquement (peut être NULL si livraison directe)
  destinationCity     String?    // Ville d'arrivée (auto-rempli depuis route, surchargeable)
  destinationAddress  String?    // Adresse précise libre (rue, quartier, point de repère)
}
```

### Logique applicative

- À la création, dès que `transitRouteId` est sélectionné :
  - `destinationCity` ← `transitRoute.arrivalCity`
  - `destinationAgencyId` ← agence d'arrivée par défaut (cf. container ou route)
- L'utilisateur peut surcharger les deux (cas où un transporteur local prend le relais après l'agence).
- `destinationAddress` reste libre pour la précision.

### UX

Dans `ParcelFormDialog` :
- Un SearchSelect "Agence de destination" (optionnel)
- Un input "Ville de destination" (pré-rempli, modifiable)
- Un textarea "Adresse précise" (optionnel)

### Migration

Le champ `destination: string` actuel est renommé en `destinationCity` ; deux nouvelles colonnes ajoutées. Pour la rétro-compat, garder `destination` comme alias en lecture (computed).

---

## 2. Routes : `Parcel.transitRouteId` ET `Container.transitRouteId`

### Problème

Les deux entités ont leur propre `transitRouteId`, qui peuvent diverger. Que se passe-t-il quand un colis est chargé dans un conteneur dont la route diffère ?

- Le **prix** est calculé sur `parcel.transitRouteId` à la création.
- Le **trajet réel** suit `container.transitRouteId`.
- Aucun garde-fou ne rapproche les deux.

### Recommandation

Distinguer **route prévue** (sur Parcel) et **route réelle** (sur Container).

À l'ajout dans un conteneur (`LoadParcelsUseCase`), vérifier :
- `container.type === parcel.transitRoute.type` (déjà fait)
- Optionnellement : `container.transitRoute.arrivalCity === parcel.transitRoute.arrivalCity` → warning si diverge

Si divergence, soit refuser, soit logger un événement `ROUTE_OVERRIDE` dans l'historique.

---

## 3. Statuts conteneur trop nombreux

### État actuel

```ts
enum ContainerStatus {
  EMPTY, LOADING, IN_TRANSIT, ARRIVED, RECEIVED, UNLOADING, UNLOADED
}
```

7 statuts, dont au moins 2 redondants.

### Problèmes

| Statut | Sémantique | Problème |
|---|---|---|
| `ARRIVED` | Conteneur arrivé à l'agence destination | Différence avec `RECEIVED` floue |
| `RECEIVED` | Conteneur réceptionné par l'agent destination | Quasi-synonyme de `ARRIVED` |
| `UNLOADING` | Déchargement en cours | État éphémère |

### Spec utilisateur

> *"penser aux status de conteneurs : Vide, en chargement, en transit, receptionné, déchargé"*

### Recommandation

Simplifier à 5 statuts conformément au besoin métier :

```ts
enum ContainerStatus {
  EMPTY,        // Vide
  LOADING,      // En chargement
  IN_TRANSIT,   // En transit
  RECEIVED,     // Réceptionné à l'arrivée
  UNLOADED,     // Déchargé (terminal — conteneur non réutilisable)
}
```

- Supprimer `ARRIVED` (renommé en `RECEIVED`)
- Supprimer `UNLOADING` (déchargement = entre `RECEIVED` et `UNLOADED`, géré par le compteur de colis non déchargés)

### Règles de transition

```
EMPTY → LOADING → IN_TRANSIT → RECEIVED → UNLOADED (terminal)
```

- `LOADING` accepte de revenir à `EMPTY` si on retire tous les colis
- `UNLOADED` est terminal, le conteneur ne peut plus rien faire

### Migration

Mapping des données existantes :
- `ARRIVED` → `RECEIVED`
- `UNLOADING` → `RECEIVED` (toujours en cours de déchargement)

---

## 4. `Container.currentLoad` denormalized

### Problème

`currentLoad` est mis à jour manuellement à chaque load/unload. Si :
- Une transaction échoue à mi-chemin (parcel update OK mais container update KO)
- Un `parcel.weight` est modifié sans recalcul
- Un colis est marqué LOST sans décrémenter

→ le champ drift silencieusement.

### Options

| Option | Avantages | Inconvénients |
|---|---|---|
| **A.** Calcul à la volée `SUM(weight)` | Toujours juste, simple | Plus lent sur grosses tables, recalculé à chaque lecture |
| **B.** Cron de réconciliation quotidien | Garde les perfs | Drift résiduel jusqu'au prochain run |
| **C.** Triggers Postgres | Toujours juste, pas de drift | Logique métier en DB (anti-pattern Clean Architecture) |

### Recommandation

**Option A** pour la simplicité, avec un `computed` côté API (un getter dans le repo). Si perfs deviennent un problème, passer à B.

---

## 5. 1 facture par colis (modèle d'affaires)

### Problème

`Parcel.invoiceId` est unique : chaque colis a sa propre facture. Conséquences :

- Un client envoie 10 colis dans la même session → 10 factures, 10 références, 10 paiements à enregistrer
- Compta plus lourde
- Statements client peu lisibles

### Recommandation

Permettre **1 facture pour N colis** (le schéma le permet déjà via la relation inverse, mais l'usage forge du 1:1).

### Workflow proposé

- Une "session" de création de colis (côté frontend) groupe les colis dans une facture commune
- Un endpoint `POST /invoices` qui prend la liste des colis et génère 1 invoice avec N lignes
- `CreateParcelUseCase` continue de fonctionner mais peut prendre un `invoiceId` existant en option

### Migration

Pas de migration de données nécessaire (existant inchangé). Juste activer le pattern N:1 pour les nouvelles créations.

---

## 6. `DEFAULT_ORG_ID` hardcodé — multi-tenant à moitié

### Problème

Plusieurs controllers contiennent :
```ts
const DEFAULT_ORG_ID = '00000000-0000-4000-a000-000000000001';
```

Le schéma a `Organization` partout (`Client.organizationId`, `Agency.organizationId`, etc.), mais le code ignore l'org du user connecté.

### Options

| Option | Description |
|---|---|
| **A.** Compléter le multi-tenant | Tous les use cases lisent `req.user.organizationId`, on filtre tout par org. |
| **B.** Retirer Organization | Si l'app est mono-tenant en pratique, simplifier le schéma (drop `organizationId` partout, drop le modèle `Organization`). |

### Recommandation

À trancher selon la roadmap business. Si pas de plan de SaaS multi-tenant, **option B** (simplification). Sinon, faire un sweep complet pour appliquer **option A**.

---

## 7. `Parcel.warehouseId` ET `Parcel.containerId` simultanés

### Problème

Un colis devrait être :
- Soit en magasin (`warehouseId`, `containerId = NULL`)
- Soit en conteneur (`containerId`, `warehouseId = NULL`)
- Soit livré/perdu (les deux NULL)

En BDD, les deux FK peuvent coexister. Le statut sert de source de vérité, mais rien ne garantit la cohérence.

### Recommandation

Invariant applicatif (déjà respecté par les use cases LoadParcels/UnloadParcel) :

```
(warehouseId IS NULL) XOR (containerId IS NULL)
sauf si status IN ('DELIVERED', 'LOST') alors les deux peuvent être NULL
```

À enforcer via :
- Check constraint Postgres (idéal mais lourd avec les statuts)
- Test d'intégration qui vérifie cette invariant après chaque transition

---

## 8. `Penalty.daysAccumulated` et `totalAmount` denormalized

### Problème

`Penalty` stocke `daysAccumulated` et `totalAmount` qui devraient être **calculés** depuis :

```
daysAccumulated = today - startDate (en jours)
totalAmount = daysAccumulated * dailyRate
```

Stocker = drift garanti dès que le temps passe.

### Recommandation

- Calculer à la lecture (computed)
- Snapshotter uniquement à la facturation (quand la pénalité est convertie en `Invoice`)

---

## 9. Manifest lines : snapshot + FK

### État actuel

`ManifestLine` a `parcelId` (FK) ET `designation` / `weight` (snapshot).

### Verdict

**Correct par design.** Si un colis est renommé après émission du bordereau, le bordereau garde le bon nom historique (intégrité de l'audit). ✅

---

## 10. Pas de `ParcelCategory` (fragile, dangereux, etc.)

### Manquant

Aucun champ pour indiquer la nature du colis. Impacts non gérés :

- Manutention (fragile = traitement spécial)
- Assurance (valeur déclarée)
- Contraintes de transport (marchandises dangereuses interdites en avion)

### Recommandation

Ajouter au schéma :

```prisma
model Parcel {
  category   ParcelCategory @default(STANDARD)
  isFragile  Boolean        @default(false)
  isHazardous Boolean       @default(false)
  declaredValue Decimal?    @db.Decimal(15, 2)  // pour l'assurance
}

enum ParcelCategory {
  STANDARD
  DOCUMENT
  FOOD
  ELECTRONICS
  CLOTHING
  OTHER
}
```

Plus tard : règle de chargement qui refuse les `isHazardous` dans les conteneurs `AIR`.

---

## 11. Unicité de `Client.phone`

### Problème

`Client.phone @unique` est global. Si on devient multi-tenant (cf. critique 6), deux orgs ne peuvent pas avoir un client avec le même numéro.

### Recommandation

Si on garde Organization :

```prisma
model Client {
  // ...
  @@unique([organizationId, phone])
}
```

Si on retire Organization, garder le `phone @unique` global est correct.

---

## 12. Loyalty points — workflow d'attribution flou

### État actuel

- `Client.loyaltyPoints: Int` existe
- `Client.loyaltyTier: LoyaltyTier` existe
- `LoyaltyTransaction` existe
- `LoyaltyTierConfig` existe (config par org)

### Problème

Aucun code ne **distribue** les points lors d'une création de colis ou d'un paiement. Les points restent à 0.

### Recommandation

Décider d'une règle métier :
- X points par 1000 XAF dépensés ?
- Bonus pour partenaires ?
- Expiration ?

Puis implémenter dans :
- `RecordPaymentUseCase` → ajoute des points + crée un `LoyaltyTransaction`
- Cron de promotion de tier (si points > seuil → upgrade)

---

## 13. Recipient fusionné dans Client

### Décision (faite le 2026-04-28)

L'ancienne table `recipients` a été fusionnée dans `clients`. Un client peut maintenant être à la fois expéditeur et destinataire.

**Justification** :
- Beaucoup de destinataires deviennent des clients récurrents
- Évite les doublons par téléphone
- Simplifie la recherche dans les forms (1 SearchSelect partout)
- Simplifie le modèle (1 table de personnes)

**Migration** : `20260428000000_merge_recipients_into_clients` (déduplication par phone, mapping vers Client).

---

## Priorisation des corrections

### À fixer rapidement (gros impact UX/data)

- [ ] **#1** Destination structurée (agence + ville + adresse)
- [ ] **#3** Statuts conteneur simplifiés à 5
- [ ] **#4** `currentLoad` recalculé ou cron de réconciliation

### Devrait fixer

- [ ] **#5** Factures multi-colis
- [ ] **#7** Invariant warehouseId XOR containerId enforced
- [ ] **#10** `ParcelCategory` + flags fragile/dangereux
- [ ] **#12** Loyalty points workflow

### Selon roadmap

- [ ] **#6** Multi-tenant complet OU drop Organization
- [ ] **#8** `Penalty` computed
- [ ] **#11** Unicité phone par org

### Déjà résolu

- [x] **#13** Recipient → Client fusionné (2026-04-28)
- [x] **#9** Snapshot dans ManifestLine (validé par design)

---

## Annexes

### Décisions ADR à documenter

- ADR-001 : Recipient ⊂ Client (fusion)
- ADR-002 : Multi-tenant (à trancher)
- ADR-003 : Modèle de facturation (1 vs N colis par facture)
- ADR-004 : Source de vérité du chargement conteneur (DB vs computed)

### Conventions de nommage à clarifier

- `ARRIVED` / `RECEIVED` : à supprimer (cf. #3)
- `Parcel.destination` : à renommer en `destinationCity` ou éclater en plusieurs champs
- `Container.currentLoad` : à renommer en `currentWeight` pour éviter ambiguïté avec un compteur de colis

---

*Document généré à partir de l'audit du 2026-04-28. À mettre à jour au fil des décisions.*
