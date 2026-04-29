# Cahier de dettes techniques — OptiPack SaaS

Liste des limitations connues, raccourcis assumés, et travaux à finir.
Mise à jour à chaque phase. Format : `#NN — [Phase X.Y] [SEV] Titre — Détail — Mitigation actuelle — Action future`.

Sévérité :
- **CRIT** = bloque la prod ou la sécurité
- **HIGH** = doit être traité avant scaling
- **MED** = à fixer dans les 6 mois
- **LOW** = nice-to-have

---

## Phase 0 — Stabilisation OptiPack

### #01 — [0.6] [MED] Tests d'intégration manquants
- Aucun test n'a été écrit pour les use cases (CreateParcel, LoadParcels, RecordPayment, etc.).
- **Mitigation** : type-check rigoureux, tests manuels en dev.
- **Action** : ajouter Vitest + tests pour les chemins critiques (auth, paiement, chargement, multi-tenant isolation).

### ~~#02~~ — [0.7] [MED] ~~Invariant `warehouseId XOR containerId` non enforced en BDD~~ ✅ RESOLU
- `CoherenceService.checkParcelLocations` + cron node-cron toutes les 6h dans `apps/api`. Log warn avec sample IDs si violation. Pas de check constraint Postgres (volontaire, complexite vs valeur).

### #03 — [0.8] [LOW] `Penalty.daysAccumulated` snapshot uniquement à la facturation
- Computed à la lecture, mais pas snapshot avant `invoiceId`.
- **Mitigation** : aucune (volontaire).
- **Action** : confirmer avec l'équipe métier que le snapshot au paiement est suffisant.

---

## Phase 1 — Orchestrator core

### #04 — [1.2] [HIGH] Migration Prisma orchestrator non générée
- Le schéma est défini mais aucune migration `prisma migrate dev` n'a été exécutée.
- **Mitigation** : faisable en local quand `ops_admin` Postgres est up.
- **Action** : `OPS_DATABASE_URL=... npx prisma migrate dev --name init` une fois la BDD démarrée. Commiter le dossier `migrations/`.

### #05 — [1.3] [MED] Pas de blacklist JWT côté serveur
- Logout = côté client uniquement (le JWT reste valide jusqu'à expiration).
- **Mitigation** : JWT court (1h).
- **Action** : si besoin de révocation immédiate, ajouter une blacklist Redis avec TTL = `exp - now`.

### ~~#06~~ — [1.3] [MED] ~~Pas de codes de récupération 2FA~~ ✅ RESOLU
- 10 codes generes au confirm 2FA (`SetupTwoFactorUseCase.confirm` retourne `recoveryCodes` en clair une seule fois). Stockes hashes bcrypt dans `OpsAdmin.twoFactorRecoveryCodes`. Endpoints : `POST /ops/auth/2fa/recovery` (login alternatif) et `POST /ops/auth/2fa/recovery/regenerate` (nouveau lot).

### ~~#07~~ — [1.4] [LOW] ~~SSH key fingerprint masqué basique~~ ✅ RESOLU
- `SshKeyEncryption.fingerprint` derive la public key (Node `createPublicKey`) puis SHA256 sur SPKI DER -> format `SHA256:<base64>`. Identifie une cle de maniere unique dans le dashboard ops.

---

## Phase 2 — Provisioning automatique

### ~~#08~~ — [2.1] [HIGH] ~~Pas de cleanup automatique sur fail~~ ✅ RESOLU
- Au dernier essai du worker PROVISION, on invoque `DeleteTenantUseCase` (drop DB + remove containers + reload Caddy). Tenant passe en ARCHIVED, logs disponibles pour debug.

### #09 — [2.1] [MED] Seed Organization fait via `node -e` inline
- Code JS injecté dans une string shell échappée. Fragile.
- **Mitigation** : fonctionnel mais lourd à debug.
- **Action** : créer un script `apps/api/scripts/seed-tenant.ts` packagé dans l'image API, appelé via `docker exec api node scripts/seed-tenant.js <orgId> <name> ...`.

### ~~#10~~ — [2.3] [HIGH] ~~Caddy admin API exposée sur localhost:2019~~ ✅ RESOLU
- `CaddyService.buildConfig` injecte `admin: { listen: 'localhost:2019', origins: ['localhost', '127.0.0.1', '[::1]'], enforce_origin: true }`. Anti DNS-rebinding + bind localhost. Auth pre-shared a ajouter si on expose un jour le admin via tunneling — pas necessaire tant que l'orchestrator passe par SSH.

### #11 — [2.4] [MED] Pas de quota disque enforced (partiellement adresse)
- ~~Aucune visibilite~~ : `DiskQuotaCheckUseCase` cron quotidien -> `pg_database_size` per tenant -> log warn a 80%, alerte webhook ops a 95%.
- **Mitigation** : monitoring + alerting. L'enforcement reel reste a faire.
- **Action restante** : LVM thin provisioning ou xfs `prjquota` pour empecher un tenant de saturer le disque (vs simplement le voir).

---

## Phase 3 — Migration cross-VPS + monitoring

### #12 — [3.1] [HIGH] SCP via base64 pour les dumps
- Scalabilité limitée à ~100 MB par dump (passage en RAM côté orchestrateur).
- **Mitigation** : OK pour la majorité des tenants démarrants.
- **Action** : passer par MinIO (control plane) en staging : source `pg_dump` → upload MinIO → target `pg_restore` from MinIO. Ajouter compression gzip.

### #13 — [3.1] [HIGH] DNS automation manquante en cas de migration cross-VPS multi-IP
- Si wildcard `*.transitsoftservices.com → IP1` et migration vers VPS2 (IP2), il faut un A record explicite `acme.transit*.com → IP2`.
- **Mitigation** : actuellement l'ops admin doit le faire à la main.
- **Action** : intégrer Cloudflare API (`OPS_CLOUDFLARE_TOKEN`) pour créer/update les A records lors d'une migration.

### ~~#14~~ — [3.2] [MED] ~~Alertes monitoring non envoyées~~ ✅ RESOLU (Phase 5)
- VPS down > 15 min → `NotificationService.vpsDown` (Discord/Slack webhook) cable dans `runVpsHeartbeat`.

---

## Phase 4 — Resources + Billing

### #15 — [4.1] [HIGH] Stripe ne supporte pas XAF directement
- Le checkout est fait en EUR (`'eur'` hardcodé dans `BillingUseCases`).
- **Mitigation** : conversion EUR → XAF à la main pour l'instant (oracle de change manuel).
- **Action** : implémenter une conversion via API (ex: openexchangerates.org), stocker le taux du jour dans `Payment.exchangeRate`. Proposer XOF (qui est sur Stripe) comme proxy ?

### #16 — [4.2] [HIGH] Mobile Money en mode stub
- MTN MoMo + Orange Money : squelettes seulement, mode `MOMO_MODE=mock` pour dev.
- **Mitigation** : payments via MoMo non opérationnels en prod.
- **Action** : intégrer MTN MoMo Collections API (sandbox dispo) puis Orange Money Cameroon. Compter ~1 semaine par opérateur (creds + signature webhook + tests sandbox).

### #17 — [4.2] [MED] Pas de webhook MoMo signé
- Le webhook accepte les notifications sans vérification de signature.
- **Mitigation** : durci à l'arrivée des creds opérateur.
- **Action** : implémenter `verifyMtnSignature` / `verifyOrangeSignature` selon les specs opérateur.

### #18 — [4.3] [MED] Disk quota non enforced (cf. #11, partiel)
- `DiskQuotaCheckUseCase` ajoute la visibilite + alerting cote ops. L'enforcement Docker reel reste a faire (cf. #11).

### #19 — [4.4] [MED] Subscription pricing par mois uniquement
- Pas de billing yearly (avec discount), pas de pro-rata sur upgrade mid-month.
- **Mitigation** : renewal manual avec `months: 12`.
- **Action** : ajouter `billingCycle: MONTHLY | YEARLY` à Subscription, calculer pro-rata pour les changements mid-cycle.

### ~~#20~~ — [4.5] [LOW] ~~Auto-freeze cron sans préavis~~ ✅ RESOLU
- `BillingUseCases.runExpiringNoticeCron` envoie un email aux subscriptions qui expirent dans <= 7j. Anti-spam via `Subscription.lastExpiryNoticeAt`. Cron quotidien (couple a auto-freeze).

### ~~#21~~ — [4.6] [MED] ~~Capacity check ne libère pas immédiatement les FROZEN~~ ✅ RESOLU
- `BillingUseCases.runReleaseLongFrozenCron(30)` archive les tenants FROZEN > 30 jours (drop DB + containers via `deleteQueue`). Idempotent. Cron quotidien.

---

## Phase 5 — Polish ops

### #31 — [5.3] [HIGH] Backups stockés sur le VPS source uniquement
- `BackupTenantUseCase` écrit le `pg_dump` dans `/var/lib/optipack/backups/...` sur le même VPS que la DB.
- **Mitigation** : OK pour récupérer une mauvaise migration, mais perte totale si le VPS brûle.
- **Action** : pousser le dump vers MinIO control plane (ou S3/Backblaze) après écriture, ne garder que la copie distante. Permet aussi le restore cross-VPS.

### #32 — [5.1] [HIGH] ops-admin frontend (partiellement adresse)
- Formulaires de creation livres : `/vps/new`, `/tenants/new` (avec selecteur VPS+plan, modules toggleables, color pickers), `/plans/new`, `/ops-admins/new` (avec affichage one-shot du mot de passe initial). Pages liste ont desormais des boutons "+ Nouveau".
- **Mitigation** : flow de provisioning operable via UI.
- **Action restante** : edition branding tenant, vue detail VPS avec graphes (recharts), page billing/MRR, edit release changelog + flags stable/critical.

### #33 — [5.4] [MED] Notifications email no-op si SMTP non configuré
- `NotificationService` log silencieusement et retourne false si SMTP non config (cas dev).
- **Mitigation** : volontaire pour le dev local.
- **Action** : ajouter une healthcheck "SMTP configured?" exposée dans le dashboard ops-admin pour ne pas découvrir en prod qu'aucun email ne part.

### ~~#34~~ — [5.4] [MED] ~~Pas de préavis avant freeze auto~~ ✅ RESOLU (cf. #20, doublon)

### #35 — [5.1] [MED] `packages/ui` extraction initiale faite
- Premier batch dans `packages/ui` : `cn`, `formatDate`, `formatBytes`, `StatusBadge`, primitives Form (`Field`, `TextInput`, `Textarea`, `Select`, `SubmitButton`). Consomme par `apps/ops-admin` (re-export via `lib/utils.ts` + `components/StatusBadge.tsx` + `components/Form.tsx`).
- **Mitigation** : base partagee minimale, composants generiques sans deps lourdes.
- **Action restante** : etendre quand AppButton/AppCard/AppDialog/AppDataTable de `apps/web` se stabilisent. Risque actuel d'extraire des composants encore en mouvement.

### ~~#36~~ — [5.1] [LOW] ~~Auth ops-admin JWT en localStorage~~ ✅ RESOLU
- Cookie `ops_token` httpOnly + Secure (en prod) + SameSite=Lax pose par le backend a chaque login/2FA confirm/recovery, supprime sur logout. `authenticateOps` accepte cookie OU Bearer (pour curl/CLI). Frontend `lib/api.ts` n'utilise plus localStorage, `withCredentials: true`, `isAuthenticated()` heuristique via `/auth/me`.

---

## Phase 5+ — À venir

### ~~#22~~ — [5.1] [HIGH] ~~Frontend ops-admin manquant~~ ✅ PARTIEL (Phase 5)
- Skeleton Next.js livre (login + dashboard + listes). Cf. #32 pour les morceaux restants (formulaires, branding, billing chart).

### #23 — [5.2] [MED] Pas de système d'invitation par email
- L'ops admin invite un nouvel admin → password initial retourné en clair dans l'API response.
- **Mitigation** : ops admin transmet via canal sûr.
- **Action** : envoi email avec lien `/setup-account?token=...` à durée de vie courte.

### ~~#24~~ — [5.3] [HIGH] ~~Pas de backups automatiques tenant~~ ✅ RESOLU (Phase 5)
- `BackupTenantUseCase` + cron nightly 24h, retention 30j. Storage encore VPS-local : cf. #31 pour le push MinIO.

### #25 — [5.4] [MED] Pas de logging centralisé
- Logs pino chacun sur son VPS, ops admin doit SSH pour consulter.
- **Mitigation** : `GET /tenants/:id/logs` pour debug ponctuel.
- **Action** : ingestion vers Loki/Grafana (ou Better Stack) en streaming.

---

## Cross-cutting

### ~~#26~~ — [SEC] [MED] ~~Aucun rate-limit sur les endpoints écriture~~ ✅ RESOLU
- `index.ts` applique un `writeLimit` global sur `/ops` : 30 ecritures/min/IP, skip GET + webhooks + auth (qui ont leur propre limite).

### ~~#27~~ — [SEC] [LOW] ~~Pas de CSP (Content-Security-Policy)~~ ✅ RESOLU
- Orchestrator : `helmet({ contentSecurityPolicy: { directives: ... } })` avec `default-src 'self'`, scripts/styles `'self'` only, `frame-ancestors 'none'`. Ops-admin : headers `Content-Security-Policy` + `X-Frame-Options DENY` + `Permissions-Policy` via `next.config.ts`.

### ~~#28~~ — [OBS] [MED] ~~Pas de métriques Prometheus~~ ✅ RESOLU
- `MetricsService` + endpoint `GET /metrics` au format Prometheus text. Implementation manuelle (sans prom-client). Expose : `optipack_http_requests_total`, `optipack_bullmq_jobs{queue,state}`, `optipack_tenants{status}`, `optipack_vps{status}`. A scraper depuis Prometheus/Grafana Cloud.

### ~~#29~~ — [DOC] [HIGH] ~~Setup VPS hôte non documenté~~ ✅ RESOLU (doc seulement)
- `docs/vps-setup.md` couvre : firewall UFW, Docker, compte `optipack`, network `optipack-shared`, services partages (postgres/redis/minio/caddy), repertoires, login GHCR, enregistrement dans l'orchestrator, verification. Le script bash automatique reste a faire.

### ~~#30~~ — [DEV] [LOW] ~~Pas de hot-reload des secrets~~ ✅ RESOLU (doc + script template)
- `docs/master-key-rotation.md` documente la procedure (stop service ~5 min, script `rotate-master-key.ts` decrit, recovery en cas d'echec). Hot-reload double-key non implemente (volontaire, complexite > valeur).

---

## Légende des tags

- **[Phase X.Y]** : phase d'origine où la dette a été créée
- **[SEC]** : sécurité
- **[OBS]** : observabilité
- **[DOC]** : documentation
- **[DEV]** : developer experience

## Workflow

À chaque livraison de phase, **ajouter** les nouveaux items en bas de la section concernée.
À chaque résolution, marquer `~~strikethrough~~` ou retirer + référencer le commit.
