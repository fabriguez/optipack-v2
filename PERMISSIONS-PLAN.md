# Plan ABAC complet — Permissions granulaires, scoping agence, masquage profond

> Objectif : chaque ressource du backoffice protégée par permissions ABAC (catalogue complet),
> scoping par agence (un personnel ne voit que ce qui touche ses agences), masquage profond
> des données croisées (un user sans `client.read` ne voit JAMAIS d'info client, même imbriquée
> dans un colis/facture/ticket/manifeste), 404 sur accès direct par lien, gestion par
> l'administrateur tenant uniquement, dans l'onglet Permissions de l'administration RH.

---

## État des lieux (vérifié dans le code)

### Ce qui existe déjà (Phase 1 ABAC)
- Modèles Prisma : `Permission` (key/label/category), `Position`, `PositionPermission`,
  `UserPermissionOverride` — `apps/api/prisma/schema.prisma:3154-3231`
- `PermissionService.getEffectivePermissionsForUser()` : position ∪ overrides(granted) −
  overrides(revoked) ; SUPER_ADMIN → `['*']` — `apps/api/src/application/services/PermissionService.ts`
- JWT contient `permissions[]`, `agencyIds[]`, `organizationId`, `role` — injecté au login
  (`LoginUseCase.ts:78-92`)
- Middlewares : `authenticate`, `authorize(roles)` (legacy RBAC), `requirePermission(keys)`,
  `requireAgency()`, `tenantGuard` — `apps/api/src/presentation/middleware/authMiddleware.ts`
- Front web : `usePermission`, `useIsTenantAdmin`, `<Can>`, sidebar avec `permissions?`/`adminOnly?`,
  `ModuleGuard` (modules tenant), page matrice `/admin/personnel/permissions`
- API front : `positionsApi.setPermissions`, `permissionsApi.{list,forUser,setOverride,removeOverride}`

### Les trous (ce que ce plan corrige)
1. `requirePermission` appliqué UNIQUEMENT aux routes RH (employees/positions/permissions/holidays/
   schedules). Tout le reste (~45 groupes : parcels, invoices, payments, cash-registers, accounting,
   disbursements, fund-transfers, expenses, debts, clients, containers, carriers, transit-routes,
   warehouses, loyalty, penalties, notifications, chat, reports, dashboard, search, audit, config,
   exports...) = `authenticate` seul.
2. Aucun filtrage de champs : `parcel.client {id, fullName, phone}`, `invoice.client {fullName,
   phone}`, `ManifestLine` (snapshot complet clientName/Phone/Email), `invoice.parcels[].recipient`
   → fuites croisées partout.
3. Scoping agence incomplet : `requireAgency()` ne vérifie que le param explicite `agencyId` ;
   les listes/détails ne filtrent pas par agences du user (un agent d'agence C voit les colis A→B).
4. Front : routes non gardées — lien direct vers une page non autorisée monte le composant et
   tente les fetchs. Sidebar partiellement mappée. web-desktop : aucun guard.
5. Catalogue permissions limité aux clés RH. Pas de clés pour les ~27 domaines métier.
6. JWT permissions périmées : un admin change la matrice, les tokens existants gardent les
   anciennes permissions jusqu'à expiration.
7. Emails credentials : fonctionnels (les 2 envoyés) mais `.catch(() => {})` silencieux — aucun
   log/trace si échec.

### Carte de connexion des ressources (qui embarque quoi)

```
Organization (tenant)
 └─ Agency ──────────────┬──────────────────────────────────────────────┐
     │                   │                                              │
User ─ UserAgency ─ Agency│   Warehouse ─ WarehouseSpace                │
User ─ Employee ─ Position ─ PositionPermission ─ Permission            │
User ─ UserPermissionOverride ─ Permission                              │
Employee ─ Client (1-1, personnel = aussi client)                       │
                                                                        │
Client ←─ clientId ── Parcel ── recipientId ─→ Client                   │
  │         Parcel.warehouseId → Warehouse → Agency      (agence dépôt) │
  │         Parcel.destinationAgencyId → Agency          (agence dest.) │
  │         Parcel.containerId → Container → departure/arrivalAgencyId  │
  │         Parcel.invoiceId → Invoice                                  │
  │         Parcel → ParcelHistory (snapshots), ParcelImage, Penalty    │
  │                                                                     │
  ├── Invoice (clientId, agencyId) ── Payment (agencyId, receivedByUser)│
  │       Invoice.parcels[] (embed tracking + recipient + images)       │
  │       Invoice ── PaymentIntent (portail client)                     │
  ├── Debt (clientId|employeeId|carrierId|agencyId, parcelId, invoiceId)│
  │       └─ DebtPayment (agencyId, cashRegisterId)                     │
  ├── Penalty (parcelId, agencyId, clientId)                            │
  ├── LoyaltyTransaction, PartnerPricing                                │
  ├── ChatConversation (clientId, agencyId, assignedUserId)             │
  └── Notification (userId|clientId|agencyId)                           │
                                                                        │
Container ── ShippingManifest ── ManifestLine                           │
   ManifestLine = SNAPSHOT dénormalisé : clientName, clientPhone,       │
   clientEmail, recipientName/Phone/Email, prix, soldes  ← FUITE MAJEURE│
Container ── Expense, DisbursementVoucher (containerId)                 │
Carrier ── Client (1-1), Container.carrierId, Debt                      │
                                                                        │
Finance (toutes rattachées agencyId) :                                  │
  AgencyCashRegister ── DisbursementVoucher (clientId!, parcelId!,      │
     containerId!, orderer snapshot, issuedBy/approvedBy User)          │
  Expense (containerId, agencyChargeId, payslip via PayslipPayment)     │
  FundTransfer (sourceAgencyId, destinationAgencyId, initiated/confirmedBy)
  JournalEntry (agencyId, sourceType/sourceId → PAYMENT/DISBURSEMENT/...)
  HeadOffice* (organizationId — siège, hors agence)                     │
                                                                        │
AuditLog (userId, agencyId, entityType/entityId)                        │
```

**Points de fuite client identifiés (backend includes + front)** :
| Ressource | Embed client | Où |
|---|---|---|
| Parcel | `client {id,fullName,phone}`, `recipient {id,fullName,phone}` | `PrismaParcelRepository.PARCEL_INCLUDE:7-55` ; front `parcels/[id]/page.tsx:215-216` |
| Invoice | `client {fullName,phone}`, `parcels[].recipient`, `parcels[].images` | front `invoices/[id]/page.tsx:239-385` |
| ManifestLine | snapshot clientName/Phone/Email + recipient | `schema.prisma:2836-2873` |
| Payment | `receivedBy {firstName,lastName}` (personnel), `invoice.reference` | front `payments/[id]/page.tsx:73-86` |
| DisbursementVoucher | `clientId`, `orderer` (nom), issuedBy/approvedBy | `schema.prisma:2087-2148` |
| Debt | clientId/employeeId/carrierId + creditor texte libre | `schema.prisma:2433-2522` |
| ChatConversation | client complet | `schema.prisma:3026` |
| Search global | colis+factures+clients mélangés | `search.routes.ts` |
| Dashboard/Reports | agrégats toutes agences | `dashboard.routes.ts`, `report.routes.ts` |

---

## Décisions d'architecture (à respecter dans toute l'implémentation)

1. **Une seule source de vérité backend.** Le front ne fait que refléter. Toute donnée masquée
   l'est PAR L'API (champ absent/null), jamais seulement cachée en CSS/condition de rendu.
2. **Sémantique des refus** :
   - Permission de module manquante → API `403` (code `PERMISSION_DENIED`, sans détail).
   - Ressource hors scope agence (ou inexistante) → API `404` (indistinguable d'un id inconnu —
     ne révèle pas l'existence).
   - Front : les deux cas rendent la page 404 standard. Le composant de page n'est JAMAIS monté
     (guard au-dessus, retour anticipé).
3. **Admin tenant = seul gestionnaire** : routes `/positions`, `/permissions`, `audit.routes.ts`,
   `config.routes.ts` et `branding.routes.ts` gardés par `authorize('ADMIN','SUPER_ADMIN')` EN PLUS
   de `requirePermission`. Les clés `permission.manage`, `settings.manage`, `settings.read`,
   `audit.read`, `branding.manage`, `sitestudio.manage` sont réservées rôle admin — refuser côté
   API toute tentative de les ajouter à une position non-admin.
4. **ADMIN du tenant bypass** : comme SUPER_ADMIN, le rôle ADMIN reçoit `['*']` dans
   `PermissionService` (l'admin gère tout son tenant). SUPER_ADMIN = cross-tenant (plateforme).
5. **Scope agence** = intersection non vide entre agences de la ressource et `user.agencyIds`.
   Jamais de filtre "agence unique" : un user peut couvrir plusieurs agences.
6. **Mode shadow d'abord** : variable `PERMISSIONS_ENFORCE=log|enforce`. En `log`, les refus
   sont loggés (`[PERM-DENY] userId route permKey`) mais laissent passer → on déploie, on observe
   les logs quelques jours, on corrige les positions seedées, puis on passe `enforce`. Évite de
   bloquer la prod le jour J.

---

## Étape 0 — Catalogue de permissions complet + seed

**Fichier à créer** : `apps/api/prisma/seed/permissions.seed.ts` (ou étendre le seed existant).
Convention : `<ressource>.<action>` ; catégories = groupes UI.

| Catégorie | Clés |
|---|---|
| `agence` | `agency.read`, `agency.create`, `agency.update`, `agency.delete`, `agency.report.read` |
| `magasin` | `warehouse.read`, `warehouse.create`, `warehouse.update`, `warehouse.delete`, `warehouse.inventory.manage` |
| `clients` | `client.read`, `client.create`, `client.update`, `client.delete`, `client.contact.read` (PII tel/email/adresse/docs) |
| `kyc` | `kyc.read`, `kyc.validate` |
| `colis` | `parcel.read`, `parcel.create`, `parcel.update`, `parcel.delete`, `parcel.status.update`, `parcel.handover`, `parcel.archive` |
| `conteneur` | `container.read`, `container.create`, `container.update`, `container.delete`, `container.depart`, `container.receive`, `manifest.read`, `manifest.manage` |
| `transport` | `carrier.read`, `carrier.create`, `carrier.update`, `carrier.delete`, `transitroute.read`, `transitroute.manage` |
| `facturation` | `invoice.read`, `invoice.create`, `invoice.update`, `invoice.cancel`, `invoice.discount`, `invoice.export` |
| `paiement` | `payment.read`, `payment.record`, `payment.void` |
| `caisse` | `cashregister.read`, `cashregister.open`, `cashregister.close` |
| `decaissement` | `disbursement.read`, `disbursement.create`, `disbursement.approve`, `disbursement.void` |
| `transfert` | `transfer.read`, `transfer.initiate`, `transfer.confirm`, `transfer.void` |
| `comptabilite` | `accounting.read`, `accounting.entry.create`, `accounting.reverse`, `accounting.account.manage` |
| `depense` | `expense.read`, `expense.create`, `expense.approve`, `expense.pay`, `charge.manage` |
| `dette` | `debt.read`, `debt.create`, `debt.update`, `debt.pay`, `debt.void` |
| `finance` | `finance.history.read`, `finance.dashboard.read`, `headoffice.read`, `headoffice.manage` |
| `personnel` | (existant) `personnel.read/create/update/delete`, `payroll.pay`, `payslip.read`, `attendance.*`, `leave.*`, `sanction.*`, `review.*`, `schedule.*`, `holiday.*` |
| `fidelite` | `loyalty.read`, `loyalty.manage`, `loyalty.policy.manage` |
| `penalite` | `penalty.read`, `penalty.manage` |
| `notification` | `notification.read`, `notification.send`, `notification.settings.manage` |
| `support` | `support.read`, `support.reply`, `support.assign` |
| `rapport` | `report.read`, `report.export`, `dashboard.read` |
| `admin` | `branding.manage`, `sitestudio.manage`, `settings.read`, `settings.manage`, `audit.read`, `position.read`, `position.manage`, `permission.manage` — **toutes réservées rôle ADMIN/SUPER_ADMIN, non assignables à une position normale** |

**Instructions** :
1. Seed idempotent (`upsert` par `key`), `isSystem: true`.
2. Seed des positions système avec presets sensés : ex. `AGENT` (parcel.*, client.read,
   invoice.read/create, payment.record, cashregister.read), `COMPTABLE` (toute la catégorie
   finance/facturation/caisse/comptabilité en lecture+écriture, client.read sans contact),
   `MAGASINIER` (warehouse.*, parcel.read/status.update), `CHEF_AGENCE` (large sur son agence).
3. Ajouter au seed un mapping legacy : pour chaque `User.role` existant sans position, créer/
   attacher la position système correspondante (migration douce du RBAC vers ABAC).
4. Mettre à jour `CATEGORY_LABELS` dans la page matrice front (`admin/personnel/permissions/page.tsx:18-25`)
   avec les nouvelles catégories.

**Validation** : `GET /permissions` retourne le catalogue complet groupé ; la matrice UI affiche
tous les groupes.

---

## Étape 1 — PolicyContext + enforcement de routes backend

**But** : chaque route de chaque groupe porte son `requirePermission(...)`. Zéro route métier
avec `authenticate` seul.

**Instructions** :
1. Créer `apps/api/src/presentation/middleware/policyContext.ts` :
   ```ts
   // construit req.policy une fois par requête
   interface PolicyContext {
     orgId: string;
     userId: string;
     agencyIds: string[];        // agences du user
     permissions: Set<string>;   // depuis JWT
     isAdmin: boolean;           // ADMIN | SUPER_ADMIN
     can(key: string): boolean;  // wildcard '*' + clé exacte
   }
   ```
   Monté juste après `authenticate + tenantGuard` sur le routeur racine.
2. Adapter `requirePermission` pour lire `req.policy` + respecter `PERMISSIONS_ENFORCE=log`.
3. Passer TOUTES les routes, fichier par fichier (`apps/api/src/presentation/routes/*.routes.ts`),
   en appliquant la table de l'Étape 0. Mapping type par groupe :
   - `GET` liste/détail → `<res>.read` ; `POST` → `<res>.create` ; `PATCH/PUT` → `<res>.update` ;
     `DELETE` → `<res>.delete` ; actions spéciales → clé dédiée (ex. `POST /payments/:id/void`
     → `payment.void`).
   - `search.routes.ts` : la recherche filtre ses sections par permission (section colis si
     `parcel.read`, clients si `client.read`, etc.) — pas de 403 global.
   - `dashboard.routes.ts`/`report.routes.ts` : `dashboard.read`/`report.read` + les widgets
     financiers exigent `finance.dashboard.read`.
   - `audit.routes.ts` → `audit.read` + `authorize('ADMIN','SUPER_ADMIN')` (admin-only).
   - `config.routes.ts` → `settings.manage` + `authorize('ADMIN','SUPER_ADMIN')` (admin-only).
   - `branding.routes.ts` (ou équivalent personalisation/site studio) → `branding.manage` +
     `authorize('ADMIN','SUPER_ADMIN')` (admin-only).
   - Ne PAS toucher : routes publiques (`/public/*`, webhooks, tracking), `/auth`, `/me`,
     `/client-portal` (auth client séparée), `/tenant-meta`.
4. `/positions`, `/permissions` : ajouter `authorize('ADMIN','SUPER_ADMIN')` en dur (décision 3).
   Dans le controller `setPermissions`, rejeter `permission.manage` dans la liste des clés.
5. `PermissionService` : ADMIN → `['*']` (décision 4).

**Validation** : test d'intégration qui itère l'app Express (`app._router.stack`) et échoue si
une route `/api/v1/*` non whitelistée n'a ni `requirePermission` ni `authorize` dans sa chaîne.
(Garde-fou anti-régression pour toute nouvelle route.)

---

## Étape 2 — Scoping agence (lignes) : résolveurs de scope + 404

**But** : un personnel ne voit que les ressources dont le "jeu d'agences" intersecte ses
`agencyIds`. Colis A→B invisible pour agence C, même par lien direct → 404.

**Principe** : un `ScopeResolver` par ressource, deux usages :
- **Liste** : fragment `where` Prisma injecté dans les repos.
- **Détail/mutation** : après fetch, `isInScope(record, ctx)` → sinon `NotFoundError` (404).

**Fichier** : `apps/api/src/application/services/scope/` (un fichier par ressource, < 700 lignes
chacun, + un `index.ts` registre).

**Définition du jeu d'agences par ressource** (depuis la carte) :
| Ressource | Agences de la ressource |
|---|---|
| Parcel | `warehouse.agencyId` ∪ `originalWarehouse.agencyId` ∪ `destinationAgencyId` ∪ `container.departureAgencyId` ∪ `container.arrivalAgencyId` ∪ `lastContainer.(dep/arr)` |
| Container | `departureAgencyId` ∪ `arrivalAgencyId` |
| Invoice, Payment, Expense, Penalty, JournalEntry, DisbursementVoucher, AgencyCashRegister, DebtPayment | `agencyId` direct |
| FundTransfer | `sourceAgencyId` ∪ `destinationAgencyId` |
| Debt | `agencyId` si présent, sinon dérivé (client/parcel/invoice liés) |
| Client | `agencyId` (enregistrement) ∪ agences d'activité (a un colis/facture dans une agence du user). Implémenter : `OR [{agencyId in}, {parcels: some <parcel-scope>}, {invoices: some {agencyId in}}]` |
| Employee | `agencyId` ∪ `EmployeeAgencyAssignment.agencyId` |
| ChatConversation, Notification | `agencyId` direct (null = org-wide → visible) |
| Warehouse | `agencyId` |
| ShippingManifest | via `container` |
| HeadOffice*, Organization config, TransitRoute, Carrier, Loyalty config | org-wide : PAS de scope agence (visibles si permission), c'est voulu — référentiels partagés |
| AuditLog | `agencyId` si non-admin |

**Instructions** :
1. Bypass : `ctx.isAdmin` → aucun filtre.
2. Listes : modifier chaque repository (`PrismaParcelRepository`, `PrismaInvoiceRepository`, ...)
   pour accepter `scope: AgencyScope` et fusionner le `where`. Les controllers passent
   `req.policy`. NE PAS dupliquer la logique dans chaque controller — toujours via le resolver.
3. Détails : helper `getInScopeOr404(resolver, id, ctx)` utilisé par tous les `GET /:id`,
   `PATCH`, `DELETE`, actions. Mutations comprises (pas seulement lecture).
4. Cas Parcel : le filtre liste Prisma correspondant :
   ```ts
   OR: [
     { warehouse: { agencyId: { in: ids } } },
     { originalWarehouse: { agencyId: { in: ids } } },
     { destinationAgencyId: { in: ids } },
     { container: { OR: [{ departureAgencyId: { in: ids } }, { arrivalAgencyId: { in: ids } }] } },
     { lastContainer: { OR: [...] } },
   ]
   ```
5. Agrégats (dashboard, reports, finance-history, accounting ledger, search) : mêmes resolvers
   appliqués aux `groupBy`/`aggregate` — un chef d'agence ne voit que les chiffres de ses agences.
6. Exports (PDF/XLSX, manifestes) : passer par les mêmes chemins repo scopés (vérifier
   `export.routes.ts`, `manifest.routes.ts`).
7. Uploads/attachments (`/uploads/object/*`, attachments polymorphes) : résoudre la ressource
   propriétaire et appliquer son scope avant de servir le fichier.

**Validation** : tests d'intégration — user agence C : `GET /parcels` ne contient pas le colis
A→B ; `GET /parcels/:id` (colis A→B) → 404 ; idem invoice/payment/expense ; dashboard chiffres
≠ admin.

---

## Étape 3 — Masquage profond des champs (field-level)

**But** : `parcel.read` sans `client.read` → AUCUNE info client dans colis, tickets, manifestes,
factures, paiements, décaissements, recherche, historique. Pareil pour personnel
(`payment.receivedBy` exige `personnel.read`), PII client (`client.contact.read`).

**Architecture** : une couche unique de "response shaping" en sortie de controller —
`apps/api/src/presentation/serializers/fieldPolicy.ts` + un policy par ressource. JAMAIS de
masquage ad hoc éparpillé dans les controllers.

```ts
// registre déclaratif
const PARCEL_POLICY: FieldPolicy = {
  client:    { require: 'client.read',  redact: ref() },   // → { id, masked: true }
  recipient: { require: 'client.read',  redact: ref() },
  'client.phone':    { require: 'client.contact.read', redact: null },
  'invoice': { require: 'invoice.read', redact: ref() },
  'pricingBreakdown': { require: 'invoice.read', redact: null },
};
```

**Règles de redaction** :
- Objet lié sans permission → remplacé par `{ id, masked: true }` (le front affiche "Accès
  restreint", jamais le nom). PAS de suppression de la clé (sinon le front croit à une donnée
  manquante et casse).
- Champs snapshot dénormalisés (le piège) : `ManifestLine.clientName/Phone/Email/recipient*`,
  `DisbursementVoucher.orderer`, `Debt.creditor`, `ParcelHistory.actorName` → remplacés par
  `"•••"` si permission absente.
- Montants : visibles avec la permission de la ressource porteuse (une facture montre ses
  montants avec `invoice.read` ; le snapshot `ManifestLine.invoiceTotal/advance/balance` exige
  `invoice.read`).

**Matrice de masquage croisé (exhaustive)** :
| Réponse | Champ | Permission requise |
|---|---|---|
| Parcel | `client`, `recipient` | `client.read` |
| Parcel | `client.phone/email`, `recipient.phone` | `client.contact.read` |
| Parcel | `invoice {reference,status}`, `pricingBreakdown`, `price` | `invoice.read` (sinon ref masquée ; `price` reste si `parcel.read` ? NON → `price` = donnée facturation, masquer sans `invoice.read`) |
| ParcelHistory | `user`, `actorName` | `personnel.read` |
| Invoice | `client` | `client.read` ; PII → `client.contact.read` |
| Invoice | `parcels[]` (tracking, designation, images) | `parcel.read` |
| Invoice | `parcels[].recipient` | `client.read` |
| Invoice | `discountHistory[].user` | `personnel.read` |
| Payment | `receivedBy`, `voidedBy` | `personnel.read` |
| Payment | `invoice.reference` | `invoice.read` |
| ManifestLine | `clientName/Phone/Email`, `recipientName/Phone/Email` | `client.read` (+ `client.contact.read` pour phone/email) |
| ManifestLine | `invoiceTotal`, `advanceAmount`, `balanceAmount`, `price` | `invoice.read` |
| DisbursementVoucher | `client`, `orderer*` | `client.read` / `personnel.read` |
| Debt | `client`/`employee`/`carrier`, `creditor` | `client.read` / `personnel.read` / `carrier.read` |
| Expense | `approvedBy`, `paidBy` | `personnel.read` |
| ChatConversation | `client` | `client.read` (support sans client.read = cas limite : `support.read` inclut le NOM client seulement, pas tel/email — décision produit, implémenter ainsi) |
| Search | sections entières | permission de chaque section |
| AuditLog | `changes` bruts | masquer les diffs de ressources non lisibles |
| Notification | contenu mentionnant un client | laisser tel quel (générées par le système selon les prefs du user — ne pas sur-ingénier) |

**Instructions** :
1. Implémenter `applyFieldPolicy(data, policy, ctx)` : profond, gère tableaux, ne mute pas.
2. Brancher en sortie des controllers de : parcels, invoices, payments, manifests,
   disbursements (agence + siège), debts, expenses, chat, search, audit, fund-transfers,
   penalties, cash-registers.
3. Adapter aussi les `include` Prisma quand c'est possible (perf) : si `!can('client.read')`,
   ne pas inclure `client` du tout et laisser le policy poser `{id, masked}` depuis `clientId`.
4. Types partagés (`packages/shared`) : ajouter `MaskedRef = { id: string; masked: true }` aux
   DTO : `client?: ClientLite | MaskedRef`.

**Validation** : tests par ressource — token sans `client.read` : `GET /parcels/:id` →
`client.masked === true`, aucun `fullName` dans tout le JSON (assert récursif sur la réponse :
`JSON.stringify(res.body)` ne contient pas le nom du client de fixture). Même assert sur
manifeste, facture, décaissement, recherche, audit.

---

## Étape 4 — Front web (Next.js) : guards de route 404 + nav + composants

**But** : composant jamais monté sans permission. Lien direct → page 404. Sidebar exacte.

**Instructions** :
1. **Carte route→permissions** : `apps/web/lib/permissions/routePolicy.ts` —
   ```ts
   export const ROUTE_POLICY: Array<{ prefix: string; anyOf: string[]; adminOnly?: boolean }> = [
     { prefix: '/agencies', anyOf: ['agency.read'] },
     { prefix: '/clients/kyc', anyOf: ['kyc.read'] },
     { prefix: '/clients', anyOf: ['client.read'] },
     { prefix: '/parcels', anyOf: ['parcel.read'] },
     // ... toutes les pages de l'inventaire, du plus spécifique au plus général
     { prefix: '/admin', anyOf: [], adminOnly: true },
     { prefix: '/settings/site', anyOf: ['sitestudio.manage'], adminOnly: true },
     { prefix: '/settings', anyOf: ['settings.read'], adminOnly: true },
     { prefix: '/audit-log', anyOf: ['audit.read'], adminOnly: true },
     { prefix: '/branding', anyOf: ['branding.manage'], adminOnly: true },
     { prefix: '/personalisation', anyOf: ['branding.manage'], adminOnly: true },
   ];
   ```
   Matching par préfixe le plus long. Une page absente de la carte = accessible (dashboard `/`).
2. **`PermissionGate`** dans `app/(dashboard)/layout.tsx` : composant client qui lit
   `usePathname()` + `usePermission` ; si refus → rendre le composant 404 du design system
   (même visuel que `not-found.tsx`) et NE PAS rendre `children`. Les pages ne montent donc
   jamais : pas de fetch, pas de flash. Pendant le chargement de session → skeleton, pas le
   contenu.
3. **Sidebar** (`components/layout/Sidebar.tsx:43-105`) : compléter `permissions:` sur CHAQUE
   item depuis la même `ROUTE_POLICY` (importer, pas dupliquer).
4. **Composants** : généraliser `<Can>` sur toutes les actions (boutons créer/modifier/void/
   approuver/exporter). Liste type : enregistrer paiement (`payment.record`), void
   (`payment.void`), remise (`invoice.discount`), clôture caisse (`cashregister.close`),
   approbation décaissement (`disbursement.approve`), KYC validate (`kyc.validate`), etc.
5. **Rendu des refs masquées** : composant `MaskedValue` ("Accès restreint", icône cadenas,
   pas de lien). Adapter `LinkRow` client dans `parcels/[id]/page.tsx:215`, carte client dans
   `invoices/[id]/page.tsx:239`, `payments/[id]/page.tsx:73-86`, tableaux du détail client,
   manifestes. Typeguard : `isMasked(x)`.
6. **Onglets internes** : page client `[id]` : les tables Parcels/Invoices/Debts s'affichent
   seulement si permission correspondante (sinon section non montée) — les hooks React Query
   correspondants ne doivent PAS être exécutés (`enabled: can`).
7. **404 sur fetch** : intercepteur ou hooks — un `GET` détail qui répond 404 rend la page 404
   (déjà le cas si bien géré ; vérifier chaque page détail).
8. Supprimer/adapter `adminOnly` ad hoc au profit de la carte unique.

**Validation** : Playwright — login user "agent" sans `accounting.read` : sidebar sans
Comptabilité ; navigation directe `/accounting` → 404 ; `/parcels/:id` d'un colis hors agence
→ 404 ; détail colis sans `client.read` → "Accès restreint" affiché, nom client absent du DOM.

---

## Étape 5 — web-desktop (Tauri/React Router) : parité

**Instructions** :
1. Réutiliser la MÊME `ROUTE_POLICY` (la déplacer dans `packages/shared` ou `packages/skins`
   pour import double — convention existante du desktop : alias vers src).
2. Décodage permissions : depuis l'accessToken du store zustand auth (même décodage base64 que
   `usePermission` web — extraire l'helper dans shared).
3. Guard : wrapper de route dans `apps/web-desktop/src/pages/*/routes.tsx` ou layout racine
   router — composant `RequirePermission` qui rend `<NotFoundPage>` sans monter l'enfant.
4. Sidebar desktop : même filtrage.
5. Refs masquées : mêmes composants `MaskedValue` (via skins/shared).

**Validation** : mêmes scénarios qu'Étape 4 sur le build desktop.

---

## Étape 6 — Onglet Permissions (admin RH) : UI complète

**Existant** : matrice position×permission (`admin/personnel/permissions/page.tsx`). API
overrides déjà exposée (`permissionsApi.forUser/setOverride/removeOverride`) mais SANS UI.

**Instructions** :
1. Page gardée : `adminOnly` (carte route) + back déjà durci (Étape 1.4).
2. Matrice : s'adapte automatiquement au nouveau catalogue (vérifier le rendu avec ~25
   catégories : accordéons par catégorie, recherche par clé/label, compteur sélectionné/total).
3. **Nouvel onglet "Exceptions par employé"** dans la même page :
   - sélecteur employé (réutiliser le picker RH existant) ;
   - affiche permissions effectives (héritées de la position, lecture seule, grisées) +
     overrides (grant en vert, revoke en rouge) ;
   - ajout d'un override : permission + sens (accorder/retirer) + raison obligatoire
     (champ `reason` existe en base) ;
   - suppression d'un override.
4. Positions par agence : le modèle `Position.agencyId` existe — exposer le filtre agence dans
   l'onglet Postes (org-wide vs agence).
5. Audit : toute modification de matrice/override écrit un `AuditLog` (action
   `PERMISSION_MATRIX_UPDATED` / `PERMISSION_OVERRIDE_SET`, changes = diff des clés).
6. Avertissement UI : bannière "Les changements prennent effet à la prochaine connexion ou
   sous N minutes" (cf. Étape 7).

---

## Étape 7 — Fraîcheur des permissions + durcissement

1. **Invalidation JWT** : ajouter claim `pv` (permission version).
   - Table légère ou champ `User.permissionsVersion Int @default(0)` ; bump à chaque
     changement de matrice de SA position ou de ses overrides (le controller permissions fait
     `updateMany` sur les users concernés).
   - `authenticate` compare `payload.pv` à la valeur DB (cache mémoire LRU 60s pour éviter un
     hit DB par requête) → mismatch = 401 `TOKEN_STALE` → le front refresh (le refresh recompute
     les permissions) → effet < 1 min.
2. **Emails credentials** (constat : les 2 emails partent bien — employé :
   `CreateEmployeeUseCase.ts:189` ; client : `ClientPortalAccessService.ts:54` — mais en
   best-effort silencieux) :
   - remplacer `.catch(() => {})` par `.catch((e) => logger.error('credential-email-failed',
     { userId/clientId, e }))` ;
   - si l'employé n'a pas d'email → l'UI de création doit l'afficher clairement ("identifiants
     non envoyés — pas d'email") ; bouton "Renvoyer les accès" déjà présent
     (`ResendEmployeeCredentialsUseCase`) — vérifier qu'il existe aussi côté client
     (provision/resend portail client) et l'ajouter sinon.
3. **Rate-limit** sur `/permissions/*` et `/positions/*` (mutations admin).
4. **Client portal** (`client-portal.routes.ts`) : vérifier que les tokens client (type
   'client') ne passent JAMAIS les middlewares staff (pas de `permissions[]` → `can()` false
   partout) — test dédié.
5. **`authorize()` legacy** : après bascule `enforce`, les `authorize` métier restants (hors
   admin) deviennent redondants — les retirer au profit des permissions (sauf décision 3).

---

## Étape 8 — Tests, shadow mode, bascule

1. **Matrice de tests d'intégration API** (vitest/jest + supertest) :
   - fixture : org, 3 agences (A, B, C), 1 admin, 1 agent A, 1 comptable B, 1 user sans rien ;
     colis A→B, facture/paiement A, dépense B, dette client.
   - pour chaque groupe de routes : 403 sans permission, 200 avec, 404 hors scope, masquage
     champ (assert "nom client absent du JSON").
   - test garde-fou de l'Étape 1 (route non protégée = échec CI).
2. **Shadow** : déployer `PERMISSIONS_ENFORCE=log` ; le seed legacy (Étape 0.3) garantit que
   les users existants gardent leurs accès actuels via positions ; analyser les `[PERM-DENY]`
   quelques jours ; ajuster les presets.
3. **Bascule** : `enforce` en beta d'abord (tags `beta-*` existants), puis prod.
4. **Docs** : `docs/permissions.md` — catalogue, conventions de clés, comment protéger une
   nouvelle route/page (checklist dev : clé seedée + requirePermission + scope resolver +
   field policy + ROUTE_POLICY + sidebar).

---

## Ordre d'exécution & dépendances

```
Étape 0 (catalogue+seed)
  → Étape 1 (routes, dépend des clés)
  → Étape 2 (scope, indépendant de 1, même PR train)
  → Étape 3 (field policy, dépend du catalogue)
  → Étape 4 (front web, dépend de 0–3 pour les refs masquées)
  → Étape 5 (desktop, dépend de 4 pour shared)
  → Étape 6 (UI admin, dépend de 0)
  → Étape 7 (fraîcheur+durcissement, dépend de 1)
  → Étape 8 (tests transverses + bascule, en continu dès l'Étape 1)
```

Chaque étape = PR(s) séparée(s), fichiers < 700 lignes, logique scope/policy centralisée
(jamais dupliquée dans les controllers).
