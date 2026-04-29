# Multi-tenant SaaS PaaS pour OptiPack

## Contexte

OptiPack v2 est aujourd'hui une application mono-tenant déployée sur un seul VPS pour TransitSoftServices. L'objectif est d'en faire un **produit SaaS** qu'on peut vendre à plusieurs transitaires : chaque client (tenant) a son propre environnement isolé sur un VPS, avec sa BDD dédiée, ses conteneurs API + web, son sous-domaine personnalisé, et son branding (logo, couleurs).

Un **OpsAdmin** (le propriétaire SaaS) accède à un dashboard séparé sur `ops-admin.transitsoftservices.com` qui lui permet de :
- Gérer un parc de VPS (ajout via SSH credentials)
- Provisionner/freezer/supprimer des tenants
- Migrer un tenant d'un VPS à un autre
- Publier de nouvelles versions d'OptiPack (les rendre disponibles aux tenants)

Et chaque **propriétaire tenant** peut depuis son propre dashboard OptiPack :
- Voir s'il y a une nouvelle version disponible
- Lire le changelog
- Décider quand l'appliquer (immédiat ou programmé)
- Rollback si besoin (dans une fenêtre de X minutes après update)
- Encaisser les abonnements (Stripe + Mobile Money)
- Voir l'usage des ressources VPS

Contraintes clés :
- **Une seule base de code** OptiPack — pas de fork par tenant
- Chaque tenant a son **propre conteneur** API + web + BDD dédiée
- **Wildcard DNS** `*.transitsoftservices.com` pré-configuré
- Custom domains supportés dès la v1 (`app.acme.com` → notre VPS via CNAME)
- **GHCR privé** pour héberger les images
- **2FA obligatoire** pour les ops admins
- **Stripe + Mobile Money** pour les paiements

## Décisions architecturales prises

| Décision | Choix |
|---|---|
| Isolation tenant | Conteneur dédié API + Web + BDD Postgres |
| DNS | Wildcard `*.transitsoftservices.com` configuré une fois |
| Custom domains | Supportés v1 (CNAME → Caddy auto HTTPS) |
| Image registry | GHCR privé (`ghcr.io/transitsoftservices/optipack-*`) |
| Paiement | Stripe + Mobile Money (MTN/Orange) |
| Auth ops | Email/password + TOTP 2FA obligatoire |
| Code source | UNE seule base, paramétrée par tenant via env + DB |
| Mises à jour | Push GHCR → tenants choisissent quand appliquer (manuel) |

## Architecture cible

```
┌─────────────────────────────────────────────────────────────┐
│ Control Plane (VPS principal ou dédié)                      │
│                                                             │
│  ┌──────────────────────────┐  ┌──────────────────────────┐│
│  │ ops-admin.transit*.com   │  │ orchestrator API         ││
│  │ (Next.js, port 3020)     │←→│ (Express, port 4020)     ││
│  └──────────────────────────┘  └────────────┬─────────────┘│
│                                              │              │
│                                  ┌───────────┴──────────┐   │
│                                  │ ops_admin_db (PG)    │   │
│                                  │ - vps                │   │
│                                  │ - tenants            │   │
│                                  │ - subscriptions      │   │
│                                  │ - jobs (BullMQ)      │   │
│                                  │ - audit_logs         │   │
│                                  └──────────────────────┘   │
│                                              │              │
│                                  ┌───────────┴──────────┐   │
│                                  │ BullMQ (Redis)       │   │
│                                  │ Workers : provision, │   │
│                                  │ migrate, monitor     │   │
│                                  └──────────────────────┘   │
└──────────────────────────────────┬──────────────────────────┘
                                   │ SSH
                                   ▼
        ┌──────────────────────────────────────────┐
        │ VPS Tenant (1 ou N)                      │
        │  ┌───────────┐                           │
        │  │ Caddy     │  (wildcard + custom)      │
        │  └─────┬─────┘                           │
        │        │                                 │
        │  ┌─────┴───────────────────────────┐     │
        │  │ acme.transitsoftservices.com    │─→ tenant-acme-web:3010
        │  │ api.acme.transitsoftservices.com│─→ tenant-acme-api:3009
        │  │ globex.transitsoftservices.com  │─→ tenant-globex-web:3012
        │  │ api.globex.transit*.com         │─→ tenant-globex-api:3011
        │  │ app.acme.com (custom CNAME)     │─→ tenant-acme-web:3010
        │  └─────────────────────────────────┘     │
        │                                          │
        │  ┌──────────────────────────────────┐    │
        │  │ Postgres (1 instance)            │    │
        │  │  ├── tenant_acme_db              │    │
        │  │  ├── tenant_globex_db            │    │
        │  │  └── ...                          │    │
        │  └──────────────────────────────────┘    │
        │  ┌──────────────────────────────────┐    │
        │  │ Redis (1 instance, namespace)    │    │
        │  │ MinIO (1 instance, bucket/tenant)│    │
        │  └──────────────────────────────────┘    │
        └──────────────────────────────────────────┘
```

## Phasage

### Phase 0 — Stabilisation OptiPack (audit fixes + tenant-ready)

**Objectif** : corriger les défauts identifiés dans `docs/design-audit.md` ET rendre OptiPack tenant-ready. Au sortir de cette phase, OptiPack actuel tourne en multi-tenant complet sur le VPS existant, sans aucune régression fonctionnelle.

#### 0.1 — Corrections audit design

Réfère-toi à `docs/design-audit.md` pour le détail. Les corrections à appliquer :

**0.1.1 — Statuts conteneur simplifiés (#3)**
- Réduire `ContainerStatus` à 5 valeurs : `EMPTY, LOADING, IN_TRANSIT, RECEIVED, UNLOADED`
- Migration : `ARRIVED → RECEIVED`, `UNLOADING → RECEIVED`
- Fichiers : `apps/api/prisma/schema.prisma`, `apps/api/src/application/use-cases/container/*UseCase.ts`, `apps/web/components/shared/StatusBadge.tsx`, `apps/web/app/(dashboard)/containers/**`
- Migration SQL nécessaire avec mapping des données existantes

**0.1.2 — `Container.currentLoad` recalculé (#4)**
- Soit le calculer à la volée (`SUM(weight)`) dans le repository, soit cron de réconciliation quotidien
- Recommandation : computed dans le `findById` du `PrismaContainerRepository`
- Garder le champ en BDD mais le rafraîchir à la demande

**0.1.3 — Destination structurée (#1)**
- Ajouter `Parcel.destinationAgencyId` (FK vers Agency, optionnel) et `Parcel.destinationAddress` (texte libre)
- Renommer `Parcel.destination` en `Parcel.destinationCity` (ou garder avec ce sens)
- Logique de pré-remplissage : sélection de `transitRouteId` → auto-fill `destinationCity` depuis `transitRoute.arrivalCity`
- UI : remplacer le seul champ `destination` par 3 champs (agence SearchSelect + ville + adresse)
- Migration de données : pour chaque parcel existant, garder la valeur en `destinationCity`, laisser `destinationAgencyId` null

**0.1.4 — Routes Parcel vs Container clarifié (#2)**
- Documenter clairement : `Parcel.transitRoute` = route prévue (pour pricing), `Container.transitRoute` = route réelle
- Étendre la règle de matching dans `LoadParcelsUseCase` : warning si `parcel.transitRoute.arrivalCity !== container.transitRoute.arrivalCity` (sauf forwarding)

**0.1.5 — `ParcelCategory` + fragile/dangereux (#10)**
- Ajouter au schéma `Parcel` :
  - `category ParcelCategory @default(STANDARD)` (enum: STANDARD, DOCUMENT, FOOD, ELECTRONICS, CLOTHING, OTHER)
  - `isFragile Boolean @default(false)`
  - `isHazardous Boolean @default(false)`
  - `declaredValue Decimal?` (pour assurance)
- UI : nouveaux champs dans `ParcelFormDialog` (sélecteur catégorie + 2 switches + input valeur déclarée)
- Règle métier : refuser le chargement de `isHazardous` dans un Container `type=AIR` (sauf forwarding)

**0.1.6 — Factures multi-colis (#5)**
- Le schéma Prisma le permet déjà (`Invoice` 1:N `Parcel` via inverse relation)
- Modifier `CreateParcelUseCase` pour accepter un `invoiceId` optionnel (joindre à une facture existante)
- Nouvel endpoint `POST /parcels/batch` qui crée N parcels avec **1 seule** facture
- UI : bouton "Créer plusieurs colis" dans la page parcels qui ouvre un dialog multi-lignes (1 client commun, N parcels, 1 facture finale)

**0.1.7 — Invariant `warehouseId XOR containerId` (#7)**
- Pas de check constraint Postgres (trop complexe avec les statuts)
- Ajouter un test d'intégration qui parcourt tous les parcels et vérifie l'invariant
- Ajouter un guard dans `UpdateParcelUseCase` qui refuse de set les deux

**0.1.8 — `Penalty` computed (#8)**
- Calculer `daysAccumulated` et `totalAmount` à la lecture, depuis `startDate` + `dailyRate`
- Snapshotter uniquement à la facturation (quand convertie en `Invoice`)
- Modifier `PrismaPenaltyRepository.findById/findAll` pour ajouter ces 2 champs computed

**0.1.9 — Loyalty points workflow (#12)**
- Décider d'une règle simple v1 : `1 point par 1000 XAF dépensés`, pas d'expiration
- Implémenter dans `RecordPaymentUseCase` :
  - Créer un `LoyaltyTransaction` (type=EARN)
  - Incrémenter `Client.loyaltyPoints`
  - Vérifier si seuil franchi → upgrade `loyaltyTier` selon `LoyaltyTierConfig`
- UI : afficher transactions loyalty dans la page client

**Livrable 0.1** : OptiPack actuel tourne avec un modèle métier corrigé, sans changement d'UI majeur sauf les 3 nouveaux champs destination.

#### 0.2 — JWT + multi-tenant data isolation

- Ajouter `organizationId` dans le JWT (`apps/api/src/application/use-cases/auth/LoginUseCase.ts`)
- Middleware `tenantGuard` qui pose `req.organizationId` (à mettre dans `apps/api/src/presentation/middleware/`)
- Modifier toutes les requêtes Prisma pour filtrer par `organizationId` :
  - **Helper** `prismaWithTenant(orgId)` qui wrappe les opérations
  - Audit complet des controllers/use-cases (regex `prisma\.\w+\.findMany`)
  - Tests d'isolation : un user de l'org A ne voit jamais les données de l'org B
- Retirer tous les `DEFAULT_ORG_ID` (`apps/api/src/presentation/controllers/ClientController.ts:9` et autres)
- Modifier `@@unique` :
  - `Client.phone` → `@@unique([organizationId, phone])`
  - `Container.designation` → `@@unique([organizationId, designation])`
  - Idem pour autres clés naturelles

#### 0.3 — Endpoint tenant-meta + branding modifiable par le tenant

**Le branding (logo, couleurs) appartient au tenant : c'est lui qui le contrôle après provisioning.**

##### 0.3.1 — Schéma : extension de `Organization`

```prisma
model Organization {
  // ... existant
  logoUrl         String?
  primaryColor    String  @default("#1B5E20")  // vert primary-900
  secondaryColor  String  @default("#4CAF50")  // vert primary-500
  accentColor     String  @default("#E8F5E9")  // primary-50
  enabledModules  String[]
}
```

##### 0.3.2 — Endpoint public branding

- `GET /api/v1/tenant-meta` (sans auth)
- Lit l'`Organization` courante
- Renvoie :
  ```json
  {
    "name": "ACME Transit",
    "logoUrl": "https://.../logo.png",
    "primaryColor": "#1B5E20",
    "secondaryColor": "#4CAF50",
    "accentColor": "#E8F5E9",
    "modules": ["parcels","clients", ...],
    "supportEmail": "support@acme.com",
    "language": "fr",
    "currency": "XAF"
  }
  ```

##### 0.3.3 — Endpoint admin pour modifier le branding

- `PATCH /api/v1/organization/branding` (auth admin du tenant)
- Body : `{ logoUrl?, primaryColor?, secondaryColor?, accentColor? }`
- Validation : couleurs au format hex `#XXXXXX`
- Logo : upload via MinIO → renvoie URL → stocke dans Organization
- Émet événement `BRANDING_UPDATED` (pour audit)

##### 0.3.4 — UI tenant : page de personnalisation

- `apps/web/app/(dashboard)/settings/branding/page.tsx`
- Visible aux admins du tenant uniquement
- Composants :
  - **Upload logo** : drag-and-drop, preview, reset au défaut
  - **3 ColorPicker** (primary, secondary, accent) avec swatches prédéfinis (verts, bleus, rouges, etc.)
  - **Live preview** : un mini-aperçu de l'app avec les nouvelles couleurs (sidebar + bouton + badge)
  - Bouton "Réinitialiser" → couleurs par défaut
  - Bouton "Enregistrer" → PATCH endpoint + invalidate query `tenant-meta`

##### 0.3.5 — Application runtime des couleurs

- Frontend boot (`apps/web/app/layout.tsx`) fetch `/tenant-meta`
- `<ThemeProvider>` du `packages/ui` reçoit les couleurs en props
- Génère **toute la palette** (primary-50 → primary-900) à partir de `primaryColor` :
  - Utilise une fonction tinycolor / culori pour générer les nuances
  - Soit fallback : on stocke les 9 nuances en DB, soit on les calcule
- Recommandation : stocker juste `primary-500` (le "color principal"), calculer les autres via une lib `culori` ou `tinycolor2` au boot
- Set en CSS variables sur `<html>` :
  ```css
  --color-primary-50: #...;
  --color-primary-100: #...;
  ...
  --color-primary-900: #...;
  ```
- Tailwind `apps/web/tailwind.config.ts` utilise ces variables :
  ```js
  primary: {
    50: 'var(--color-primary-50)',
    500: 'var(--color-primary-500)',
    ...
  }
  ```

##### 0.3.6 — Cohérence avec orchestrator

- Au provisioning, l'ops admin a saisi `primaryColor` + `secondaryColor` initiaux dans l'orchestrator
- Le worker `provision-tenant` pousse ces valeurs dans la `Organization` du tenant DB (seed)
- **Après provisioning, le tenant est maître** : ses modifications ne remontent pas vers l'orchestrator
- Si l'ops admin veut voir le branding actuel d'un tenant : l'orchestrator fait un fetch live de `/tenant-meta` du tenant
- Trade-off : l'orchestrator n'a qu'une vue "initiale" en cache, le live vient du tenant

#### 0.4 — Module flags (système d'activation/désactivation)

- Ajouter au schéma `Organization` : `enabledModules String[] @default([...])`
- Modules disponibles : `['parcels','clients','containers','warehouses','agencies','invoices','payments','expenses','disbursements','fund-transfers','penalties','employees','reports','chat','accounting','loyalty','transit-routes']`
- Backend : middleware `requireModule(name)` sur les routes concernées
- Frontend : helper `useModuleEnabled(name)` qui lit du Context

#### 0.5 — Build & push images vers GHCR

- Modifier `.github/workflows/deploy-*.yml` :
  - Build `optipack-api:VERSION` et `optipack-web:VERSION` avec tag = `git sha` + `latest`
  - Push vers `ghcr.io/transitsoftservices/optipack-api` (privé)
  - Push vers `ghcr.io/transitsoftservices/optipack-web`
- Le déploiement actuel "TransitSoftServices" devient **un tenant comme les autres** (juste premier servi)

**Livrable Phase 0** : OptiPack actuel tourne en multi-tenant complet sur le VPS existant, avec son `organizationId` injecté dans le JWT. Toutes les data sont isolables. Les images sont sur GHCR privé.

---

### Phase 1 — Orchestrateur (apps/orchestrator)

**Objectif** : un backend Express dédié qui gère les VPS et tenants, mais sans automation de provisioning encore (CRUD basique).

#### 1.1 — Création de `apps/orchestrator`

Nouveau workspace dans le monorepo :
```
apps/orchestrator/
├── package.json (Express + tsyringe + Prisma + node-ssh + bullmq)
├── prisma/schema.prisma (DB ops_admin)
├── src/
│   ├── index.ts
│   ├── config/
│   ├── domain/
│   ├── application/use-cases/
│   ├── infrastructure/
│   │   ├── ssh/
│   │   ├── docker/
│   │   ├── caddy/
│   │   └── queue/ (BullMQ workers)
│   └── presentation/
└── tsconfig.json
```

#### 1.2 — Schéma Prisma OpsAdmin

```prisma
model OpsAdmin {
  id              String @id @default(uuid())
  email           String @unique
  passwordHash    String
  twoFactorSecret String?  // TOTP secret
  isActive        Boolean @default(true)
  lastLoginAt     DateTime?
  // ...
}

model VPS {
  id            String @id @default(uuid())
  name          String
  host          String     // IP ou hostname
  port          Int        @default(22)
  username      String
  sshKeyEncrypted String   // chiffré AES (master key en env)
  region        String?
  totalCpu      Int?
  totalRamMb    Int?
  totalDiskGb   Int?
  status        VPSStatus  @default(ACTIVE)
  lastSeenAt    DateTime?
  createdAt     DateTime   @default(now())
  tenants       Tenant[]
}

enum VPSStatus { ACTIVE, MAINTENANCE, DECOMMISSIONED }

model Tenant {
  id              String @id @default(uuid())
  slug            String @unique  // ex: "acme" → acme.transitsoftservices.com
  name            String
  ownerEmail      String
  ownerUsername   String
  logoUrl         String?
  primaryColor    String  @default("#1B5E20")
  secondaryColor  String  @default("#4CAF50")
  enabledModules  String[]
  customDomain    String?  @unique  // ex: "app.acme.com"

  // Provisioning
  vpsId           String
  vps             VPS @relation(fields: [vpsId], references: [id])
  apiPort         Int     // alloué dynamiquement
  webPort         Int
  dbName          String  // tenant_acme_db
  status          TenantStatus @default(PROVISIONING)

  // Subscription
  subscription    Subscription?

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  freezedAt       DateTime?
  deletedAt       DateTime?
}

enum TenantStatus {
  PROVISIONING
  ACTIVE
  FROZEN       // suspendu (paiement en retard) - containers stop
  MIGRATING    // en cours de migration
  ARCHIVED     // soft-delete
}

model Subscription {
  id              String @id @default(uuid())
  tenantId        String @unique
  tenant          Tenant @relation(fields: [tenantId], references: [id])
  plan            String  // "starter" | "pro" | "enterprise"
  pricePerMonth   Decimal @db.Decimal(15, 2)
  currency        String  @default("XAF")
  startedAt       DateTime
  expiresAt       DateTime
  isActive        Boolean @default(true)
  // ...
  payments        Payment[]
}

model Payment {
  id              String @id @default(uuid())
  subscriptionId  String
  subscription    Subscription @relation(fields: [subscriptionId], references: [id])
  amount          Decimal @db.Decimal(15, 2)
  provider        String  // "stripe" | "mtn" | "orange" | "manual"
  externalRef     String?
  status          String  // "pending" | "succeeded" | "failed"
  paidAt          DateTime?
  createdAt       DateTime @default(now())
}

model ProvisioningJob {
  id            String @id @default(uuid())
  tenantId      String
  type          String  // "PROVISION" | "MIGRATE" | "FREEZE" | "UNFREEZE" | "DELETE"
  payload       Json
  status        String  // "queued" | "running" | "succeeded" | "failed"
  logs          String? // accumulés au fil du job
  startedAt     DateTime?
  finishedAt    DateTime?
  createdAt     DateTime @default(now())
}

model AuditLog {
  id          String @id @default(uuid())
  opsAdminId  String?
  action      String
  entityType  String
  entityId    String?
  payload     Json?
  ipAddress   String?
  createdAt   DateTime @default(now())
}
```

#### 1.3 — Auth ops admin (email/password + 2FA TOTP)

- `POST /ops/auth/login` : email/password → renvoie un challenge 2FA si 2FA activé
- `POST /ops/auth/verify-2fa` : code TOTP → renvoie JWT
- 2FA setup obligatoire au premier login (génère secret, affiche QR code)
- Session JWT 1h (vu les pouvoirs)

#### 1.4 — Endpoints VPS (CRUD)

```
POST   /ops/vps              { name, host, port, username, sshPrivateKey }
GET    /ops/vps              liste avec status + métriques
GET    /ops/vps/:id
PATCH  /ops/vps/:id
DELETE /ops/vps/:id          (refusée si tenants actifs)
POST   /ops/vps/:id/test-connection   (SSH ping)
GET    /ops/vps/:id/usage    CPU/RAM/disk via SSH `top` parsing
```

SSH key chiffrée avec AES-256-GCM, master key en env `OPS_MASTER_KEY`.

#### 1.5 — Endpoints Tenant (CRUD basique)

```
POST   /ops/tenants          { slug, name, ownerEmail, vpsId, modules[], colors, customDomain? }
GET    /ops/tenants
GET    /ops/tenants/:id
PATCH  /ops/tenants/:id
DELETE /ops/tenants/:id
POST   /ops/tenants/:id/freeze
POST   /ops/tenants/:id/unfreeze
POST   /ops/tenants/:id/migrate { targetVpsId }
GET    /ops/tenants/:id/logs   (cat docker logs via SSH)
GET    /ops/tenants/:id/jobs   (provisioning jobs history)
```

À ce stade, ces endpoints créent juste des **records** en BDD. Pas encore de provisioning réel.

**Livrable Phase 1** : un orchestrateur qui sait modéliser des VPS et tenants, mais ne provisionne pas encore.

---

### Phase 2 — Provisioning automatique

**Objectif** : `POST /ops/tenants` déclenche réellement un provisioning sur le VPS cible.

#### 2.1 — Worker BullMQ : `provision-tenant`

```ts
async function provisionTenant(tenantId: string) {
  // 1. Charge le tenant + son VPS
  // 2. SSH vers le VPS (via node-ssh)
  // 3. Crée la BDD Postgres tenant : `CREATE DATABASE tenant_<slug>_db`
  // 4. Génère le fichier .env tenant :
  //      DATABASE_URL=postgresql://...:5432/tenant_<slug>_db
  //      TENANT_SLUG=acme
  //      JWT_SECRET=<random>
  //      AUTH_SECRET=<random>
  //      MINIO_BUCKET=tenant-<slug>
  //      ... (autres secrets)
  // 5. Pull les images depuis GHCR :
  //      docker login ghcr.io (avec PAT lu en env)
  //      docker pull ghcr.io/.../optipack-api:latest
  //      docker pull ghcr.io/.../optipack-web:latest
  // 6. Run les conteneurs avec ports alloués :
  //      docker run -d --name tenant-<slug>-api -p <apiPort>:4000 --env-file ... ghcr.io/.../optipack-api
  //      docker run -d --name tenant-<slug>-web -p <webPort>:3000 --env-file ... ghcr.io/.../optipack-web
  // 7. Run prisma migrate deploy à l'intérieur du conteneur API :
  //      docker exec tenant-<slug>-api pnpm prisma migrate deploy
  // 8. Seed initial : créer Organization + admin user (avec ownerEmail) + send password reset email
  // 9. Append au Caddyfile + reload Caddy admin API :
  //      acme.transitsoftservices.com { reverse_proxy localhost:<webPort> }
  //      api.acme.transitsoftservices.com { reverse_proxy localhost:<apiPort> }
  //      [si customDomain] app.acme.com { reverse_proxy localhost:<webPort> }
  // 10. Update tenant.status = ACTIVE
  // 11. Notification email à l'owner avec son lien
}
```

#### 2.2 — Allocation de ports

- Plage de ports tenants : `30000-39999`
- L'orchestrateur tient un compteur en BDD `Tenant.apiPort` / `webPort`
- À l'attribution : trouve le premier port libre dans la plage pour ce VPS

#### 2.3 — Caddy admin API

- Caddy expose une admin API sur `localhost:2019`
- L'orchestrateur push des configs via PATCH JSON
- Hot reload sans restart
- Référence : https://caddyserver.com/docs/api

#### 2.4 — Lifecycle workers

- `freeze-tenant` : `docker stop tenant-<slug>-api tenant-<slug>-web` + Caddy returns `503` (page de paiement)
- `unfreeze-tenant` : `docker start ...` + Caddy back to reverse_proxy
- `delete-tenant` : stop + rm conteneurs, drop DB, remove Caddy block, archive logs

**Livrable Phase 2** : un click sur "Create Tenant" provisionne réellement un environnement opérationnel en ~2 minutes.

---

### Phase 3 — Migration cross-VPS + monitoring

#### 3.1 — Worker `migrate-tenant`

```
1. Sur source VPS : freeze tenant (containers stop)
2. Sur source VPS : pg_dump tenant_<slug>_db > backup.sql
3. SCP backup.sql vers target VPS
4. Sur target VPS : provision tenant comme phase 2 mais avant le seed
5. Sur target VPS : pg_restore < backup.sql
6. Update Caddy sur target VPS
7. Update DNS si différent (mais wildcard pointe vers source — il faut donc déplacer le wildcard ou créer un A record explicite)
8. Health check
9. Sur source VPS : remove containers + DB + Caddy block
10. Update tenant.vpsId = targetVpsId, tenant.status = ACTIVE
```

**Edge case DNS** : avec wildcard `*.transit*.com → IP1`, déplacer un tenant sur VPS2 (IP2) demande un A record explicite : `acme.transit*.com → IP2`. Cloudflare API ou modification manuelle.

#### 3.2 — Monitoring VPS

- Worker `vps-monitor` toutes les 5min :
  - SSH `top -bn1 | head -5` → parse CPU/RAM
  - SSH `df -h /` → parse disque
  - SSH `docker ps --format ...` → liste conteneurs running par tenant
  - Update `VPS.lastSeenAt`, `VPS.totalCpu`, etc.
- Endpoint `GET /ops/vps/:id/usage` retourne les dernières metrics
- Frontend ops-admin affiche graphes (charts existants `recharts`)

**Livrable Phase 3** : on peut déplacer un tenant et surveiller la santé des VPS.

---

### Phase 4 — Billing (Stripe + Mobile Money)

#### 4.1 — Plans + abonnements

- Définir 3 plans : `starter`, `pro`, `enterprise` avec prix/features
- À la création tenant, choisir un plan → crée `Subscription` avec `expiresAt = today + 30j` (trial gratuit ou paiement immédiat)

#### 4.2 — Stripe

- Config Stripe Connect ou direct (compte unique TransitSoftServices)
- Endpoint `POST /ops/billing/stripe/checkout` → crée une session Stripe Checkout
- Webhook `POST /ops/billing/stripe/webhook` → on `payment_succeeded` :
  - Crée `Payment` record
  - Étend `Subscription.expiresAt` de 30 jours
  - Si tenant FROZEN → `unfreeze-tenant` job

#### 4.3 — Mobile Money

- Intégration MTN MoMo + Orange Money (chacun a son API)
- Endpoint `POST /ops/billing/momo/initiate` → renvoie une URL ou un OTP pour valider
- Webhook (ou polling) → confirme le paiement → même flow que Stripe

#### 4.4 — Cron auto-freeze

- Job quotidien : pour chaque `Subscription` avec `expiresAt < today` et tenant `ACTIVE` → `freeze-tenant`
- Page de freeze Caddy : "Votre abonnement a expiré, contactez votre admin pour renouveler" avec bouton de paiement

#### 4.5 — Page de paiement tenant

- Dans le frontend OptiPack : page `/billing` accessible aux admins du tenant
- Récupère `Subscription` via API ops-admin (endpoint cross-orchestrateur)
- Permet de payer pour étendre

**Livrable Phase 4** : un tenant qui ne paie pas est automatiquement freeze, peut payer pour réactiver, support Stripe + MoMo.

---

### Phase 4.5 — Updates contrôlés par tenant

**Objectif** : chaque propriétaire tenant décide quand appliquer une nouvelle version d'OptiPack. Aucun update forcé sauf cas critique.

#### 4.5.1 — Modèle de versions

Ajouter au schéma orchestrateur :

```prisma
model Release {
  id            String @id @default(uuid())
  version       String @unique  // "1.4.2"
  apiImageTag   String           // "ghcr.io/.../optipack-api:1.4.2"
  webImageTag   String           // "ghcr.io/.../optipack-web:1.4.2"
  changelog     String           // markdown
  isStable      Boolean @default(false)  // marqué stable par ops
  isCritical    Boolean @default(false)  // patch sécurité — auto-update possible
  publishedAt   DateTime @default(now())
  publishedById String?
}

model TenantUpdateJob {
  id              String @id @default(uuid())
  tenantId        String
  fromVersion     String
  toVersion       String
  status          String  // "scheduled" | "running" | "succeeded" | "failed" | "rolled_back"
  scheduledFor    DateTime?  // null = immédiat
  startedAt       DateTime?
  finishedAt      DateTime?
  backupRef       String?  // chemin du pg_dump pré-update
  errorLog        String?
  triggeredBy     String   // "tenant_owner" | "ops_admin" | "auto_critical"
  rollbackBefore  DateTime?  // jusqu'à cette date, le tenant peut rollback en 1 click
}
```

Ajouter à `Tenant` :
```prisma
model Tenant {
  // ...
  currentVersion  String   // "1.4.2"
  pinnedVersion   String?  // si défini, le tenant ne reçoit pas les updates auto
  autoUpdatePolicy String  @default("MANUAL")  // "MANUAL" | "AUTO_STABLE" | "AUTO_CRITICAL_ONLY"
}
```

#### 4.5.2 — Publication d'une release par l'ops admin

GitHub Actions :
- À chaque push tag `v*` sur la branche main → build + push images vers GHCR avec ce tag
- Webhook GHCR (ou polling toutes les heures depuis l'orchestrateur) → détecte nouvelle version
- L'orchestrateur crée un record `Release` (status `unpublished`)

Dans `apps/ops-admin` :
- Page `/releases` : liste des releases détectées
- Pour chaque release : éditer changelog, marquer `isStable`, marquer `isCritical`, publier
- Quand publié : tous les tenants reçoivent une notification email/in-app "Update vX.Y.Z disponible"

#### 4.5.3 — Notification dans le dashboard tenant

Côté OptiPack web (modification de `apps/web`) :
- Un endpoint dans l'API tenant `GET /api/v1/system/updates` qui proxie vers l'orchestrateur :
  - Récupère `Tenant.currentVersion` + dernière `Release` publiée
  - Renvoie `{ currentVersion, latestVersion, hasUpdate, changelog, isCritical }`
- Sidebar : badge de notification si update disponible
- Page `/settings/updates` (visible aux admins du tenant uniquement) :
  - Affiche version actuelle, version disponible, changelog rendered en markdown
  - Bouton **"Appliquer maintenant"** (avec confirmation + warning sur le downtime ~30sec)
  - Option **"Programmer pour..."** (date+heure → enqueue avec `scheduledFor`)
  - Historique des updates passées + bouton "Rollback" si dans la fenêtre

L'authentification de cet endpoint se fait via :
- Le tenant API a un service token partagé avec l'orchestrateur (env `ORCHESTRATOR_SERVICE_TOKEN`)
- Le frontend tenant appelle `/api/v1/system/updates/apply` qui est un proxy vers l'orchestrateur authentifié
- L'orchestrateur vérifie que le user est bien admin du tenant

#### 4.5.4 — Worker `update-tenant`

```ts
async function updateTenant(jobId: string) {
  const job = await prisma.tenantUpdateJob.findUnique({...});
  const tenant = await prisma.tenant.findUnique({ where: { id: job.tenantId }, include: { vps: true } });

  // 1. Health check pré-update : tenant accessible ?
  // 2. Backup auto : pg_dump tenant_<slug>_db → MinIO control plane
  //    → Stocker la référence dans job.backupRef
  // 3. SSH au VPS, docker pull nouvelles images
  // 4. Stop containers actuels (downtime commence)
  // 5. Run prisma migrate deploy avec un container temporaire qui pointe vers la nouvelle image
  //    docker run --rm --env-file .env ghcr.io/.../optipack-api:NEW pnpm prisma migrate deploy
  // 6. Si migration échoue → rollback DB depuis backup + redémarrer ancien container → status = failed
  // 7. Si migration OK :
  //    docker rm tenant-<slug>-api tenant-<slug>-web
  //    docker run avec les nouvelles images (mêmes ports, même env)
  // 8. Health check : GET /health du nouveau container, attendre 200 (timeout 60s)
  // 9. Si health check OK :
  //    Update tenant.currentVersion = job.toVersion
  //    job.status = succeeded
  //    job.rollbackBefore = now() + 30min
  //    Notification email "Update appliquée"
  // 10. Si fail :
  //    Restore old containers from images :PREVIOUS (toujours disponibles localement)
  //    Restore DB from backup
  //    job.status = failed
  //    Notification "Update échouée, votre instance est revenue à vX.Y.Z"
}
```

#### 4.5.5 — Rollback en 1 click

- Dans la fenêtre `rollbackBefore` (30min après l'update), le tenant peut rollback :
  - Job `rollback-tenant` qui :
    - pg_restore depuis `job.backupRef`
    - Run anciens containers (image PREVIOUS)
    - Update `tenant.currentVersion = job.fromVersion`

Après la fenêtre, le rollback nécessite intervention ops admin.

#### 4.5.6 — Updates critiques forcés

- Si une release est marquée `isCritical` (faille sécurité) :
  - L'ops admin peut décider de **forcer** l'update sur tous les tenants
  - Les tenants reçoivent un préavis de 24h
  - Au bout de 24h, update auto la nuit (3h-5h locale)
  - Override : un tenant peut payer une "Enterprise SLA" pour avoir 7 jours de délai

#### 4.5.7 — Pinned version

- Un tenant peut "pinner" sa version (admin du tenant) :
  - `pinnedVersion = "1.4.2"` → ne reçoit aucune notification update
  - Sauf updates critiques (forcés)
  - Risque : versions obsolètes, plus de support

**Livrable Phase 4.5** : workflow complet de gestion des versions par tenant + rollback.

---

### Phase 5 — Polish ops

#### 5.1 — Frontend `apps/ops-admin`

Pages :
- `/login` (email + 2FA)
- `/dashboard` (stats globales : nb tenants, nb VPS, MRR)
- `/vps` (liste, filtres, ajout)
- `/vps/[id]` (détails, usage temps réel, tenants hébergés)
- `/tenants` (liste, filtres par status)
- `/tenants/new` (formulaire en plusieurs étapes : infos → VPS → modules → branding → plan)
- `/tenants/[id]` (détails, logs, bouton freeze/unfreeze/migrate/delete)
- `/billing` (tous les abonnements, MRR chart)
- `/audit-logs`
- `/ops-admins` (gérer les admins, inviter, revoke)

UI réutilise composants OptiPack (`AppCard`, `AppButton`, `AppDataTable`, `AppSearchSelect`, etc.) — créer un package `@transitsoftservices/ui` partagé.

#### 5.2 — Audit logs

- Toute action ops admin → `AuditLog`
- Page de visualisation avec filtres

#### 5.3 — Backups

- Job nightly : `pg_dump` de chaque tenant DB → upload vers MinIO du control plane
- Rétention 30 jours
- Endpoint `POST /ops/tenants/:id/restore` pour restaurer un backup

#### 5.4 — Notifications

- Email à l'owner tenant : provisioning success, paiement reçu, freeze imminent, freeze actif
- Email à l'ops admin : erreur de provisioning, VPS offline

**Livrable Phase 5** : système production-ready.

---

## Fichiers critiques à créer/modifier

### Modifications OptiPack existant (Phase 0)

**Audit fixes (0.1) :**
- `apps/api/prisma/schema.prisma` — `ContainerStatus` réduit à 5, `Parcel` ajouts (destinationAgencyId, destinationAddress, category, isFragile, isHazardous, declaredValue), `Invoice 1:N Parcel` clarifié
- `apps/api/prisma/migrations/202604XX_audit_fixes/migration.sql` — mapping statuts + colonnes parcel + Penalty (rien à migrer, juste recalculé)
- `apps/api/src/application/use-cases/container/LoadParcelsUseCase.ts` — règle isHazardous + warning routes
- `apps/api/src/application/use-cases/container/*UseCase.ts` — adapter aux nouveaux statuts
- `apps/api/src/application/use-cases/parcel/CreateBatchParcelsUseCase.ts` — **nouveau** : N parcels avec 1 facture
- `apps/api/src/infrastructure/database/repositories/PrismaContainerRepository.ts` — currentLoad recalculé
- `apps/api/src/infrastructure/database/repositories/PrismaPenaltyRepository.ts` — daysAccumulated/totalAmount computed
- `apps/api/src/application/use-cases/payment/RecordPaymentUseCase.ts` — attribution loyalty points
- `apps/web/components/shared/StatusBadge.tsx` — adapter aux 5 statuts
- `apps/web/app/(dashboard)/parcels/ParcelFormDialog.tsx` — champs destination + category + flags + declaredValue
- `apps/web/app/(dashboard)/parcels/ParcelBatchFormDialog.tsx` — **nouveau** : création multi
- `apps/web/app/(dashboard)/containers/[id]/page.tsx` — adapter UI aux nouveaux statuts
- `packages/shared/src/schemas/parcel.schema.ts` — schémas Zod pour les nouveaux champs

**Tenant-ready (0.2-0.5) :**
- `apps/api/src/application/use-cases/auth/LoginUseCase.ts` — ajouter `organizationId` dans JWT
- `apps/api/src/presentation/middleware/authMiddleware.ts` — extraire et propager `organizationId`
- `apps/api/src/presentation/middleware/tenantGuard.ts` — **nouveau** : injecte `req.organizationId`
- `apps/api/src/presentation/middleware/requireModule.ts` — **nouveau** : check module flag
- `apps/api/src/presentation/controllers/*.ts` — retirer tous les `DEFAULT_ORG_ID`, lire `req.organizationId`
- `apps/api/src/infrastructure/database/repositories/Prisma*Repository.ts` — filtrer par `organizationId` partout
- `apps/api/prisma/schema.prisma` — `Organization.enabledModules`, ajuster `@@unique` à inclure `organizationId`
- `apps/api/src/presentation/routes/v1/tenant-meta.routes.ts` — **nouveau** : endpoint public branding
- `apps/api/src/presentation/controllers/OrganizationController.ts` — **nouveau** : endpoint admin pour PATCH branding
- `apps/api/src/application/use-cases/organization/UpdateBrandingUseCase.ts` — **nouveau**
- `apps/web/app/layout.tsx` — fetch `tenant-meta` au boot, wrappe avec ThemeProvider
- `apps/web/app/(dashboard)/settings/branding/page.tsx` — **nouveau** : UI personnalisation
- `apps/web/components/branding/ColorPicker.tsx` — **nouveau** : color picker custom
- `apps/web/components/branding/LiveBrandingPreview.tsx` — **nouveau** : preview en temps réel
- `apps/web/lib/providers/TenantProvider.tsx` — **nouveau** : Context React modules+branding
- `apps/web/components/layout/Sidebar.tsx` — filtrer items selon `enabledModules`
- `packages/ui/src/theme/ThemeProvider.tsx` — **nouveau** : génère palette depuis primary, set CSS vars
- `packages/ui/src/theme/palette-generator.ts` — **nouveau** : génère 9 nuances depuis 1 couleur
- `.github/workflows/deploy-api.yml` + `deploy-web.yml` — push GHCR

### Nouveau workspace `apps/orchestrator/`

- `apps/orchestrator/package.json` — express, tsyringe, prisma, node-ssh, bullmq, otplib
- `apps/orchestrator/prisma/schema.prisma` — schéma ops admin
- `apps/orchestrator/src/index.ts`
- `apps/orchestrator/src/config/database.ts`
- `apps/orchestrator/src/infrastructure/ssh/SSHService.ts` — wrapper node-ssh
- `apps/orchestrator/src/infrastructure/docker/DockerService.ts` — exec docker via SSH
- `apps/orchestrator/src/infrastructure/caddy/CaddyService.ts` — call Caddy admin API
- `apps/orchestrator/src/infrastructure/queue/workers/*.ts` — BullMQ workers
- `apps/orchestrator/src/application/use-cases/tenant/ProvisionTenantUseCase.ts`
- `apps/orchestrator/src/application/use-cases/tenant/MigrateTenantUseCase.ts`
- `apps/orchestrator/src/application/use-cases/tenant/FreezeTenantUseCase.ts`
- `apps/orchestrator/src/application/use-cases/billing/StripeWebhookUseCase.ts`
- `apps/orchestrator/src/application/use-cases/release/PublishReleaseUseCase.ts`
- `apps/orchestrator/src/application/use-cases/release/UpdateTenantUseCase.ts`
- `apps/orchestrator/src/application/use-cases/release/RollbackTenantUseCase.ts`
- `apps/orchestrator/src/infrastructure/queue/workers/update-tenant.worker.ts`
- `apps/orchestrator/src/infrastructure/queue/workers/rollback-tenant.worker.ts`
- `apps/orchestrator/src/infrastructure/ghcr/GHCRClient.ts` (poll new tags)
- `apps/api/src/presentation/routes/v1/system.routes.ts` (proxy update endpoints vers orchestrateur)
- `apps/web/app/(dashboard)/settings/updates/page.tsx` (UI tenant)
- `apps/orchestrator/src/presentation/routes/*.ts`
- `apps/orchestrator/Dockerfile.prod`

### Nouveau workspace `apps/ops-admin/`

- `apps/ops-admin/package.json` — Next.js (réutilise UI components OptiPack)
- `apps/ops-admin/app/layout.tsx`
- `apps/ops-admin/app/(auth)/login/page.tsx`
- `apps/ops-admin/app/(dashboard)/...` — pages détaillées en Phase 5

### Nouveau package `packages/ui/` — **partagé web + ops-admin**

**Objectif** : DRY total — `apps/web` et `apps/ops-admin` consomment exactement les mêmes composants. Fix une fois, applique partout.

**Structure** :
```
packages/ui/
├── package.json (peer deps : react, tailwind, lucide-react, etc.)
├── src/
│   ├── components/
│   │   ├── AppButton.tsx
│   │   ├── AppCard.tsx
│   │   ├── AppDataTable.tsx
│   │   ├── AppDialog.tsx
│   │   ├── AppInput.tsx
│   │   ├── AppPhoneInput.tsx
│   │   ├── AppSearchSelect.tsx
│   │   ├── AppSelect.tsx
│   │   ├── AppSwitch.tsx
│   │   ├── AppTabs.tsx
│   │   ├── AppTextarea.tsx
│   │   └── primitives/   (Radix/Base UI base components)
│   ├── shared/
│   │   ├── ConfirmDialog.tsx
│   │   ├── PageTransition.tsx
│   │   ├── SearchBar.tsx
│   │   ├── StatusBadge.tsx
│   │   └── RowActions.tsx
│   ├── hooks/
│   │   └── (hooks UI réutilisables)
│   ├── theme/
│   │   ├── tokens.ts          (palette, espacements)
│   │   ├── tailwind-preset.ts (preset Tailwind à étendre dans chaque app)
│   │   └── ThemeProvider.tsx  (Context React pour theme dynamique)
│   └── index.ts               (barrel export)
└── tsconfig.json
```

**Migration** :
- `apps/web/components/ui/Apt*.tsx` → `packages/ui/src/components/`
- `apps/web/components/shared/*.tsx` → `packages/ui/src/shared/`
- Les composants spécifiques business (ex: `AppCountryCitySelect` qui dépend de `lib/locations.ts`) restent dans `apps/web`
- `apps/web/tailwind.config.ts` étend `packages/ui/theme/tailwind-preset.ts`
- `apps/web/app/layout.tsx` wrappe l'app avec `<ThemeProvider>` du package
- Idem pour `apps/ops-admin`

**Theming dynamique runtime** : le `ThemeProvider` accepte des couleurs en props (lues depuis `/tenant-meta`). Les couleurs sont injectées en CSS variables (`--color-primary-50`, ..., `--color-primary-900`). Tailwind utilise ces variables via le preset. Résultat : changer les couleurs d'un tenant = juste changer la config DB, le rendu se met à jour au reload.

**Bénéfices** :
- 1 fix CSS → 2 apps mises à jour
- Pas de divergence visuelle
- Theming runtime propre (pas de duplication de palettes)

**Coût initial** : ~2 jours d'extraction propre (à faire en Phase 0.5 ou en début de Phase 1).

### Infrastructure

- `docker-compose.control-plane.yml` — orchestrator + ops-admin + leur Postgres + Redis + Caddy
- `docker/orchestrator/Dockerfile.prod`
- `docker/ops-admin/Dockerfile.prod`
- `.github/workflows/deploy-control-plane.yml`

## Réutilisation existante

- `apps/api/src/application/services/HistoryService.ts` — pattern à dupliquer pour `AuditLogService` orchestrateur
- `apps/api/src/infrastructure/queue/` (déjà câblé BullMQ) — réutiliser le pattern pour orchestrateur
- `apps/api/src/infrastructure/email/` — réutiliser pour notifications ops
- `apps/web/components/ui/` — extraire dans `packages/ui` pour partage avec ops-admin
- `apps/web/components/shared/AppDataTable`, `SearchBar`, `FilterDialog` — idem
- `apps/web/lib/api/client.ts` (axios + interceptor) — pattern à reprendre dans ops-admin

## Vérifications / tests end-to-end

### Phase 0
**Audit fixes (0.1) :**
- Statuts conteneur : containers existants tous mappés sur les nouveaux 5 statuts, transitions OK
- `currentLoad` toujours juste : créer parcel, charger, modifier weight → currentLoad reflète bien
- Destination structurée : créer parcel avec route + agence destination → champs cohérents
- ParcelCategory : refus de chargement HAZARDOUS dans container AIR (sauf forwarding)
- Factures multi-colis : créer batch de 3 colis → 1 facture avec 3 lignes
- Penalty computed : avancer la date système, vérifier que daysAccumulated évolue
- Loyalty : payer une facture → points crédités, transaction visible

**Tenant-ready (0.2-0.5) :**
- Login user de l'org A : ne voit que data de l'org A (test : créer 2 orgs, comparer listes parcels)
- `GET /api/v1/tenant-meta` renvoie le bon branding selon le subdomain
- Module désactivé → API renvoie 403, sidebar cache l'item
- Image Docker disponible sur GHCR privé, déploiement actuel TransitSoftServices fonctionne avec cette image

### Phase 1
- `POST /ops/vps` avec mauvaise SSH key → erreur claire
- `POST /ops/vps/:id/test-connection` → OK ou KO selon état
- Création de tenant : tenant en BDD avec status `PROVISIONING`

### Phase 2
- Création tenant → après ~2min : conteneurs running, sous-domaine accessible, login first user OK
- Custom domain : configurer un DNS test (ex: tenant1.lab.com → notre VPS), créer tenant avec ce custom domain → HTTPS auto fonctionne

### Phase 3
- Migration ACME de VPS1 vers VPS2 : downtime < 30sec, données intactes
- VPS down → `lastSeenAt` qui ne se met plus à jour, alerte ops

### Phase 4
- Paiement Stripe test mode → webhook reçu → subscription étendue → tenant unfreeze
- Subscription expire → cron freeze → page Caddy 503 → paiement → unfreeze

### Phase 4.5
- Push d'une nouvelle version vers GHCR → l'orchestrateur la détecte → ops publie → notification reçue par le tenant
- Tenant clique "Appliquer" → backup auto → containers updatent → health check OK → confirmation
- Tester un cas de migration DB échouée → rollback auto → tenant garde sa version d'avant
- Test rollback manuel dans la fenêtre 30min après update OK
- Test "Programmer pour cette nuit" → job exécuté à l'heure prévue

### Phase 5
- Backup nightly OK pour chaque tenant
- Restauration depuis backup OK
- Audit log capture toute action ops

## Estimation effort

| Phase | Effort | Risque |
|---|---|---|
| Phase 0 | 3-4 semaines | Moyen (audit fixes + data isolation à faire avec rigueur) |
| Phase 1 | 1 semaine | Faible (CRUD) |
| Phase 2 | 2 semaines | Élevé (provisioning fragile) |
| Phase 3 | 1 semaine | Moyen (migration complexe) |
| Phase 4 | 1-2 semaines | Élevé (intégrations Stripe + MoMo) |
| Phase 4.5 | 1-2 semaines | Élevé (migration DB + rollback safety) |
| Phase 5 | 1-2 semaines | Faible (UI polish) |

**Total** : 10-14 semaines de dev solo. **Phase 0 démarre par les corrections d'audit** (sections 0.1.1 à 0.1.9), puis enchaîne sur la préparation tenant-ready (sections 0.2 à 0.5). C'est un livrable cohérent qui améliore OptiPack actuel et prépare le terrain pour le SaaS PaaS.

## Risques majeurs

1. **Provisioning fragile** : un échec à mi-chemin laisse des conteneurs/DBs orphelines. Mitigation : transactions distribuées + cleanup automatique sur fail.
2. **Sécurité SSH keys** : si la BDD orchestrateur leak, tous les VPS sont compromis. Mitigation : chiffrement AES + rotation régulière + master key sortie de la BDD.
3. **Caddy admin API** : config malformée peut down tous les tenants d'un VPS. Mitigation : valider config avant push, garder backup auto.
4. **Coût des paiements MoMo** : chaque opérateur a son intégration spécifique, parfois sans vraie webhook. Polling à mettre en place.
5. **2FA recovery** : un ops admin qui perd son TOTP est bloqué. Mitigation : codes de récupération + contact technique.
6. **Migration DB cassée à l'update** : un changement schema mal fait peut corrompre la DB tenant. Mitigation : pg_dump systématique avant chaque update, rollback auto si migration KO, fenêtre de rollback manuel 30min.
7. **Versions trop anciennes** : un tenant qui pin sur v1.0.0 et qu'on veut migrer plus tard. Mitigation : règle "rolling upgrade" par paliers (v1.0 → v1.5 → v2.0, pas v1.0 → v2.0).

## Points à trancher après Phase 0

- **Trial gratuit** : combien de jours ? (suggestion : 14 jours)
- **Suppression tenant** : soft-delete ou destruction immédiate ? (suggestion : soft + cron qui purge après 30j)
- **Logs tenant** : centralisés dans le control plane ou laissés sur chaque VPS ? (suggestion : laisser local, exposer via API à la demande)
- **Backups storage** : MinIO du control plane ou S3/Backblaze ? (suggestion : commencer en local, migrer si volume grossit)
- **Coût VPS pour tester** : prévoir 2 VPS de test (~10$/mois) pour valider migration cross-VPS
