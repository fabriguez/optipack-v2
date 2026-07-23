# Audit permissions & exceptions — OptiPack v2

> Date : 2026-07-23 · Périmètre : `apps/api` (Express), `apps/web` (Next.js), `apps/web-desktop` (Tauri).
> Méthode : les 5 étapes demandées — inventaire boutons/liens/sidebar, inventaire permissions,
> inventaire endpoints, corrélation permissions↔endpoints, corrélation permissions↔UI — puis
> livraison d'un guard route/élément. Réf. plan : [`PERMISSIONS-PLAN.md`](../PERMISSIONS-PLAN.md).

---

## 0. Verdict

Le système ABAC est **beaucoup plus avancé** que ce que laisse croire l'« état des lieux » du plan.
Ce qui existe et fonctionne :

- **Backend** : 54 fichiers de routes, quasi toutes gardées par `requirePermission` et/ou `authorize`.
  Un **test garde-fou CI** (`apps/api/src/__tests__/route-permission-guard.test.ts`) échoue si une
  route v1 non whitelistée n'a aucun gardien. `PERMISSIONS_ENFORCE` **défaut = `enforce`** (bloque
  vraiment, pas juste log). Matrice postes/overrides verrouillée `authorize('ADMIN')` + rejet de
  `permission.manage`.
- **Frontend** : `PermissionGate` (route → 404-like) + `<Can>` + filtrage sidebar + `usePermission`.
  web-desktop à parité.

Ce qui **n'est PAS proprement géré** (le cœur de la demande) :

| # | Problème | Gravité |
|---|---|---|
| X1 | `authorize()` legacy (rôle) co-existe avec l'ABAC sur les routes d'écriture → **les permissions de poste sont cosmétiques** pour beaucoup d'écritures ; un poste `Chef d'agence` avec `container.manage` mais rôle `CHEF_AGENCE` se prend un **403** car son rôle n'est pas dans la liste `authorize(...)`. | 🔴 Structurel |
| X2 | **Masquage de champs (Étape 3) implémenté uniquement sur `invoice.routes`.** Colis, manifestes, paiements, décaissements, dettes, recherche renvoient les données client (nom/tél/PII) **en clair** à qui a la permission de la ressource porteuse mais PAS `client.read`. | 🔴 Fuite PII |
| S2/S3/S6 | Trous d'énumération : `GET /search` sans perm par module, `GET /uploads/object/*` IDOR intra-org, `GET/POST /notifications/:id[...]` **sans vérif de propriétaire** (IDOR confirmé). | 🔴 |
| X3 | Seul `permission.manage` est « réservé admin » ; `audit.read`, `settings.read`, `system.config`, `branding.manage`, `sitestudio.manage`, `position.manage`, `user.manage` sont **assignables à un poste** alors que leurs routes sont verrouillées `authorize('ADMIN')` → clés trompeuses + décalage front/back. | 🟠 |
| U1/U2 | Front : `/admin/**` (matrice, postes, exceptions, plannings, `/admin/loyalty` **page money**) **absent de la carte de routes** → montés par URL directe pour tout user connecté. | 🟠 (corrigé, voir §6) |
| K1-K5 | Clés sémantiquement fausses/faibles (delete gardé par `.create`, etc.). | 🟡 |

---

## 1. Liste des permissions (catalogue ABAC)

Source unique : [`apps/api/src/domain/permissions/permission-catalog.ts`](../apps/api/src/domain/permissions/permission-catalog.ts).
**89 clés**, convention `<ressource>.<action>`, groupées par catégorie (= groupes UI de la matrice) :

`personnel` (21 : personnel.*, attendance.*, leave.*, sanction.*, schedule.manage, holiday.manage,
review.*, payslip.*, payroll.pay) · `clients` (client.read/create/update/delete, **client.contact.read** = PII) ·
`kyc` (kyc.read/validate) · `colis` (parcel.read/create/update/delete/deliver/archive, parcelgroup.manage) ·
`magasin` (warehouse.read/manage/inventory.manage) · `conteneur` (container.read/manage, manifest.read/manage) ·
`transport` (carrier.read/manage, transitroute.read/manage) · `facturation` (invoice.read/manage/discount/export) ·
`paiement` (payment.read/record/void) · `caisse` (cashregister.read/open/close/disburse) ·
`decaissement` (disbursement.read/create/order/approve/void) · `transfert` (transfer.read/initiate/confirm/void) ·
`comptabilite` (accounting.read/manage) · `depense` (expense.read/create/approve/pay, charge.manage) ·
`dette` (debt.read/create/update/pay/void) · `finance` (finance.history.read, finance.dashboard.read, headoffice.read/manage) ·
`agence` (agency.read/manage, dailyreport.read/manage) · `fidelite` (loyalty.read/manage/policy.manage, client.partner.manage) ·
`penalite` (penalty.read/manage) · `notification` (notification.read/send/manage/settings.manage) ·
`support` (support.read/reply/assign) · `rapport` (dashboard.read, report.read/export) ·
`admin` (position.manage, **permission.manage**, user.manage, system.config, settings.read, branding.manage, sitestudio.manage, audit.read).

Postes système préconfigurés : Chef d'agence, Superviseur, Comptable, Magasinier, Logisticien, Agent,
Commercial, Stagiaire (presets dans le même fichier). `permission.manage` **jamais** assignable
(`ADMIN_ONLY_PERMISSION_KEYS`). ADMIN/SUPER_ADMIN → wildcard `*`.

---

## 2. Corrélation ENDPOINTS ↔ PERMISSIONS

Inventaire complet des 54 fichiers de routes réalisé (méthode + tableau exhaustif conservés hors de
ce doc pour la lisibilité). La très grande majorité des endpoints porte la **bonne** clé sémantique
(`GET`→`.read`, `POST`→`.create`, action→clé dédiée : `payment.void`, `invoice.discount`,
`disbursement.approve`, `cashregister.close`, etc.). Ci-dessous **uniquement les écarts**.

### 2.1 Trous d'enforcement (routes sensibles sans permission)

| Sévérité | Endpoint | Constat |
|---|---|---|
| 🔴 | `POST /tenant-meta/reset-owner-password` (+ `/organization`) & `PATCH /tenant-meta/ops-sync` | Régénère le mot de passe du SUPER_ADMIN du tenant (renvoyé en clair), gardé **uniquement par un service token partagé** — fuite du token = takeover owner. |
| 🔴 | `GET /search/` | Recherche transverse **colis + clients + conteneurs + factures**, `authenticate` seul, **aucune** `requirePermission` par module (scope agence uniquement). TODO dans le fichier. |
| 🔴 | `GET /uploads/object/*` | `authenticateUserOrClient` seul. Vérifie `requesterOrgId === owner.organizationId` **mais** `if (!record) allow (legacy)` → objets sans fiche de propriété servis à tout authentifié ; borné org, **pas** agence/permission (KYC/CNI, reçus, justificatifs → IDOR intra-org). Vérifié [`UploadController.ts:112-150`](../apps/api/src/presentation/controllers/UploadController.ts). |
| 🔴 | `GET /notifications/:id`, `POST /notifications/:id/read`, `POST /notifications/read-all` | `repo.findById(id)` **sans filtre par destinataire** → IDOR : n'importe quel staff lit/marque la notif d'un autre par id. Vérifié [`NotificationController.ts:130-151`](../apps/api/src/presentation/controllers/NotificationController.ts). |
| 🟠 | `POST /uploads/image`, `POST /uploads/file`, `POST /uploads/public-image` | Écritures objet, `authenticate` seul, aucune permission. |
| 🟠 | `GET /expenses/:id/attachments`, `…/disbursements/…`, `…/debts/…`, `…/fund-transfers/…` | Lecture de pièces jointes **financières**, `authenticate` seul (commentaire : « scoping objet à venir »). |
| 🟠 | `GET /payment-methods/` | Lecture référentiel sans permission **et** effet de bord d'écriture (`ensureSystemMethods` upsert) sur un GET. |

### 2.2 Clés sémantiquement fausses / trop faibles

| Endpoint | Clé actuelle | Devrait être |
|---|---|---|
| `DELETE /expenses/:id`, `PATCH /expenses/:id` | `expense.create` | `expense.delete` / `expense.update` (clés manquantes au catalogue) |
| `DELETE /recipients/:id`, `PATCH /recipients/:id` | `client.create` | `client.delete` / `client.update` |
| `DELETE`/`POST /fund-transfers/:id/attachments` | `transfer.initiate` | clé de gestion de pièce jointe / `transfer.update` |
| `GET /clients/:clientId/pricings` | `loyalty.read` | `client.partner.manage` (ou une `pricing.read`) — domaine mismatché |
| `POST /imports/employees`, `…/agencies/:id/employees` | `report.export` | clé d'import dédiée (write gardé par une clé d'export) |

### 2.3 Le problème de fond — `authorize()` legacy vs ABAC (X1)

De **très nombreuses** routes d'écriture portent `requirePermission(x)` **ET** `authorize('SUPER_ADMIN','ADMIN', …roles)`.
Le `authorize` (basé sur `User.role`) est la contrainte **liante** : il ignore les permissions de poste.

Exemples : `POST /containers` → `authorize('SUPER_ADMIN','ADMIN','AGENT')` ; `POST /transit-routes`,
`POST /carriers`, `POST/PATCH/DELETE /agencies` → `authorize('SUPER_ADMIN','ADMIN')` ;
`GET /reports/*` → `authorize('SUPER_ADMIN','ADMIN','COMPTABLE')` ;
`POST /fund-transfers` → `authorize('SUPER_ADMIN','ADMIN')`, etc.

Conséquence : un utilisateur de **rôle** `CHEF_AGENCE` (ou `SUPERVISEUR`, `LOGISTICIEN`…) dont le
**poste** accorde `container.manage` **ne peut pas** créer de conteneur — son rôle n'est pas dans la
liste. L'ABAC est neutralisé pour ces écritures. C'est la dette **Étape 7.5** du plan (« après bascule
`enforce`, retirer les `authorize` métier redondants ») **non faite**.

### 2.4 Clés « admin » assignables mais routes verrouillées rôle (X3)

`ADMIN_ONLY_PERMISSION_KEYS = ['permission.manage']` seulement. Or `audit.read`, `settings.read`,
`system.config`, `branding.manage`, `sitestudio.manage`, `position.manage`, `user.manage` :
- **assignables** à un poste via la matrice (pas rejetés) ;
- mais leurs routes ajoutent `authorize('ADMIN','SUPER_ADMIN')` (vérifié `audit.routes.ts:11`,
  `config.routes.ts:14`).

→ un admin peut cocher `audit.read` pour un poste ; le front (sidebar `Audit` gardé sur `audit.read`,
non `adminOnly`) montre le menu + la page ; l'API renvoie **403**. Clé trompeuse.

### 2.5 Masquage de champs quasi absent (X2)

Étape 3 du plan implémentée **uniquement** dans `invoice.routes` (`applyFieldPolicy`). Toutes les
autres ressources qui embarquent du client renvoient les données **non masquées** :
`Parcel.client/recipient`, `ManifestLine.clientName/Phone/Email` (snapshot dénormalisé),
`Payment.receivedBy`, `DisbursementVoucher.orderer`, `Debt.creditor`, résultats `search`.
→ un poste avec `parcel.read` mais **sans** `client.read` voit quand même nom/tél client partout.

---

## 3. Liste des éléments UI (sidebar, liens, boutons)

- **Sidebar** ([`Sidebar.tsx`](../apps/web/components/layout/Sidebar.tsx)) : 4 sections (`mainNav`,
  `financeNav`, `adminNav`, `systemNav`), ~31 items, chacun avec `permissions?[]` (any) + `adminOnly?`
  + `module?`. Filtrage dans `NavSection` (admin/wildcard voient tout). **Correctement gardée.**
- **TopBar / menu user** : Mon profil, Paramètres, Déconnexion, cloche notifs, résultats de recherche
  globale → navigation seulement (pages gardées en aval).
- **Pages dashboard** : 64 `page.tsx` sous `app/(dashboard)/**`, toutes enveloppées par
  `ModuleGuard > PermissionGate` ([`layout.tsx:94`](../apps/web/app/(dashboard)/layout.tsx)).
- **Boutons d'action** : `<Can permission=…>` déjà utilisé dans ~20 pages (create/edit/delete/void/
  approve/close/discount/record-payment/kyc.validate…). Infra : [`Can.tsx`](../apps/web/lib/components/Can.tsx),
  [`usePermission.ts`](../apps/web/lib/hooks/usePermission.ts).

> Note : le front est **UX uniquement** — `apps/web/middleware.ts` ne protège aucune route dashboard.
> La sécurité réelle reste l'API. Un guard front sert à ne pas monter/afficher, pas à autoriser.

---

## 4. Corrélation UI ↔ PERMISSIONS (écarts)

| Sévérité | Élément | Constat | Statut |
|---|---|---|---|
| 🟠 | Pages `/admin/**` (matrice permissions, postes, exceptions, plannings, jours non ouvrés, **`/admin/loyalty`**) | Absentes de la carte de routes → montées par URL directe pour tout user connecté. `/admin/loyalty` = page **money** (taux points, conversion FCFA) sans aucun garde. | ✅ corrigé §6 |
| 🟠 | `/clients/kyc` | Carte de routes = `client.read` mais sidebar = `adminOnly` ; API = `authorize('ADMIN')`. Page PII (dossiers KYC) sur-exposée à un simple `client.read`. | ✅ corrigé (`adminOnly`) |
| 🔴 | Boutons paiement `parcels/[id]`, `parcel-groups/[id]` (×2) | Ouvrent le dialog d'encaissement **sans** `<Can payment.record>` (incohérent avec le reste de l'app). | ✅ corrigé (`<Can>`) |
| 🟡 | Boutons Export/Impression (listes clients, paiements, factures, colis, dépenses, pénalités, grand-livre…) | Non gardés (seul le `.read` de la page). Fuite de données financières/PII à l'export. Décision produit : faut-il une permission d'export ? (`invoice.export`/`report.export` existent, pas de clé générique). | ⏳ backlog |
| 🟡 | `containers/[id]` : bordereau comparaison + PDF/XLSX historique manifeste + « Nouveau colis » in-dialog | Rendus inconditionnellement (pas de `manifest.manage` / `parcel.create`). | ⏳ backlog |
| 🟡 | `settings/*` par action (surtout **payment-providers** = secrets agrégateur, email = clé API Resend) | Reposent sur le seul `adminOnly` de route, aucune granularité par action. | ⏳ backlog (acceptable tant que /settings = admin only) |

Tout le reste (create/edit/delete/void/approve/discount/close/confirm/kyc.validate…) est **correctement**
gardé par `<Can>` / `usePermission`.

---

## 5. Le guard livré (mount/unmount de chaque élément)

Le mécanisme existait partiellement ; il est désormais **complété et unifié**.

### 5.1 Guard de ROUTE (monte/démonte les pages)

- **Nouveau, source de vérité unique** : [`apps/web/lib/permissions/dashboardPolicy.ts`](../apps/web/lib/permissions/dashboardPolicy.ts)
  (+ copie synchro `apps/web-desktop/src/lib/permissions/dashboardPolicy.ts`).
  - `ROUTE_POLICY` : carte **complète** incluant désormais `/admin/personnel/{permissions,exceptions,postes,plannings,jours-non-ouvres}`, `/admin/loyalty`, filet `/admin`, `/clients/kyc`.
  - `matchRoutePolicy()` : résolution par **préfixe le plus long** (le plus spécifique gagne) — remplace
    l'ancien `.find()` premier-match fragile à l'ordre.
- `PermissionGate` (web + web-desktop) **réécrit** pour consommer `matchRoutePolicy`. Refus →
  composant 404-like, enfant **jamais monté** (pas de fetch, pas de flash).

### 5.2 Guard d'ÉLÉMENT (monte/démonte boutons & liens)

- `<Can permission="…" mode="any|all">` (existant) : à poser sur chaque action sensible.
- Ajouté sur les 3 boutons paiement non gardés ; sidebar `Politique fidelité` passée en `adminOnly`.

### 5.3 Comment protéger un nouvel élément (checklist)

1. Clé seedée dans `permission-catalog.ts`.
2. Route API : `requirePermission('<clé>')` (+ scope agence via resolver).
3. Page : ajouter l'entrée dans `dashboardPolicy.ts` (préfixe + `anyOf`/`adminOnly`).
4. Bouton : envelopper dans `<Can permission="<clé>">`.
5. Vérifier le test garde-fou CI (`route-permission-guard.test.ts`).

---

## 6. Backlog priorisé (correctifs restants, non appliqués)

**P0 — sécurité API :**
1. ✅ **FAIT** `GET /notifications/:id` + `markAsRead` : ownership `notification.userId === req.user.userId`, sinon 404 (`NotificationController.ts`). `read-all` était déjà scopé (`markAllAsRead(userId)`).
2. ⏳ `GET /uploads/object/*` : retirer le fallback « legacy allow » — **différé** : les clés n'encodent pas l'orgId et les objets anciens n'ont pas de fiche `uploadObject` → un deny sec casserait les médias legacy en prod. Prérequis : fiabiliser `uploadObject.create` (await, non best-effort) → backfill des objets existants → puis passer le fallback en deny.
3. ✅ **FAIT** `GET /search` : chaque section interrogée seulement si `policy.can('<res>.read')` (sinon `[]`), scope agence conservé (`search.routes.ts`).
4. ✅/⏳ Pièces jointes financières : `GET` gardés par `expense.read`/`disbursement.read`/`debt.read`/`transfer.read` (`attachment.routes.ts`). `POST /uploads/image|file|public-image` **laissé** : namespacé `uploads/<userId>/`, faible risque, une `requirePermission` globale casserait de nombreux formulaires.
5. ⏳ `reset-owner-password` / `ops-sync` : rotation + audit du service token (ops, hors code).

**P1 — cohérence du modèle :**
6. ✅ **FAIT (X1)** `authorize(role)` legacy retiré des domaines **finance + opérationnels** : accounting,
   report, payment.void, cash-register.close, debt (pay/void/adjust/litigated), fund-transfer,
   penalty.calculate, container (lifecycle), manifest, parcel-group, routing.redistribute → la
   permission ABAC est le **seul** gardien (fixe le blocage à tort des rôles Comptable/Chef/etc.).
   **Conservé volontairement** (admin-appropriate, clé coarse ou opération référentiel/siège) :
   agency, warehouse, carrier, transit-route, head-office, payment-method + surfaces admin réservées.
7. ✅ **FAIT (X3)** `ADMIN_ONLY_PERMISSION_KEYS` étendu à audit.read/settings.read/system.config/
   branding.manage/sitestudio.manage/position.manage/user.manage ; matrice UI (web + desktop) masque
   les clés `adminOnly` (flag exposé par `GET /permissions`).
8. ✅ **FAIT (X2)** `applyFieldPolicy` était déjà branché sur parcels/invoices/payments/manifests/
   debts/expenses/chat ; ajouté sur **disbursements** (noms de champs corrigés : issuedBy/ordererUser/
   approvedBy/client), **penalties** (+ PII contact), et **search** (téléphone client masqué sans
   `client.contact.read`).

**P2 — clés & UI :**
9. ✅ **FAIT (K)** `expense.update`/`expense.delete` ajoutés (catalogue + presets Chef/Comptable),
   expense PATCH/DELETE recâblés ; recipient PATCH/DELETE → `client.update`/`client.delete` ;
   `GET /clients/:id/pricings` → `client.read`. **Reseed requis** au boot (self-heal couvre les postes système ; les postes custom devront cocher les nouvelles clés).
10. ✅ **FAIT (UI)** boutons d'export (`ExportButton` + `XlsxExportButton`, ~18 usages) gardés par
    `report.export` **au niveau du composant partagé** ; boutons paiement + `/admin/loyalty` déjà gardés.
11. ⏳ Extraire `dashboardPolicy.ts` dans `packages/shared` pour supprimer la duplication web/desktop.
