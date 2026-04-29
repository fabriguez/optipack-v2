# OptiPack Orchestrator

Backend du **control plane** SaaS — gère les VPS, les tenants, les abonnements, les versions et les jobs de provisioning.

Séparé des tenants OptiPack : sa propre BDD (`ops_admin`), sa propre Redis (`ops-redis`), son propre port (`4020`).

## Démarrage local

```bash
# 1. Provisionner la BDD ops + Redis
docker compose -f docker-compose.control-plane.yml up -d ops-postgres ops-redis

# 2. Variables d'env (cf. .env.example - section CONTROL PLANE)
#    Notamment : OPS_DATABASE_URL, OPS_JWT_SECRET, OPS_MASTER_KEY
#    OPS_MASTER_KEY = openssl rand -hex 32

# 3. Migrations
cd apps/orchestrator
OPS_DATABASE_URL=postgresql://opsadmin:opsadmin_password@localhost:5433/ops_admin \
  npx prisma migrate dev

# 4. Seed (crée le super-admin initial)
SEED_OPS_ADMIN_EMAIL=admin@transitsoftservices.com \
SEED_OPS_ADMIN_PASSWORD='changeme' \
OPS_DATABASE_URL=... \
  npx tsx prisma/seed.ts

# 5. Lancer
pnpm --filter @transitsoftservices/orchestrator dev
```

## Endpoints (Phase 1)

### Auth

- `POST /ops/auth/login` (public, rate-limit 10/15min/IP) — `{ email, password, totpCode? }` → `{ accessToken, opsAdmin }` ou `{ challengeToken, requires2FA }`
- `POST /ops/auth/2fa/setup` (public + challengeToken) — `{ challengeToken }` → `{ secret, qrCodeDataUrl }`
- `POST /ops/auth/2fa/confirm` — `{ challengeToken, totpCode }` → `{ accessToken }`
- `GET /ops/auth/me` (auth) — info de l'admin courant
- `POST /ops/auth/logout` (auth) — log l'événement (JWT stateless côté client)

### VPS (super-admin)

- `GET /ops/vps?status=ACTIVE`
- `POST /ops/vps` — `{ name, host, port, username, sshPrivateKey, ... }` (test SSH avant create)
- `GET /ops/vps/:id`
- `PATCH /ops/vps/:id` — update meta + rotation SSH key (`sshPrivateKey` optionnel, testé avant persistance)
- `DELETE /ops/vps/:id` (soft → `DECOMMISSIONED`, refus si tenants actifs)
- `POST /ops/vps/:id/test-connection`
- `GET /ops/vps/:id/usage` — CPU / RAM / disque via SSH (`top` / `free` / `df`)

### Tenants

- `GET /ops/tenants?status=ACTIVE&vpsId=...`
- `POST /ops/tenants` — `{ slug, name, ownerEmail, vpsId, plan, customDomain?, ... }` → record + job `PROVISION` queued
- `GET /ops/tenants/:id`
- `PATCH /ops/tenants/:id`
- `POST /ops/tenants/:id/freeze` → `FROZEN` + job queued
- `POST /ops/tenants/:id/unfreeze` → `ACTIVE` + job queued
- `POST /ops/tenants/:id/archive` (super-admin) → `ARCHIVED` + job queued
- `POST /ops/tenants/:id/migrate` (super-admin) `{ targetVpsId }` → `MIGRATING` + job queued
- `GET /ops/tenants/:id/jobs?limit=50` — historique des jobs de provisioning
- `GET /ops/tenants/:id/logs?service=api&tail=200` — `docker logs` live via SSH

### Ops Admins (super-admin)

- `GET /ops/ops-admins`
- `POST /ops/ops-admins` (invite) — `{ email, fullName, isSuperAdmin? }` → `{ id, ..., initialPassword }` (à transmettre par canal sûr, le user devra setup 2FA au 1er login)
- `GET /ops/ops-admins/:id`
- `PATCH /ops/ops-admins/:id` — `{ fullName?, isActive?, isSuperAdmin? }` (impossible de se désactiver soi-même, ni de retirer le dernier super-admin)
- `POST /ops/ops-admins/:id/reset-2fa` — pour un autre admin uniquement, en cas de perte de TOTP

### Audit logs (super-admin)

- `GET /ops/audit-logs?opsAdminId=...&entityType=Tenant&entityId=...&action=TENANT_FREEZED&limit=50&cursor=...`
- Pagination cursor-based ; renvoie `{ data, nextCursor }`
- Toute action sensible (login/logout, VPS/Tenant CRUD, OpsAdmin invite, freeze, etc.) y est tracée automatiquement

⚠️ **Phase 1 = CRUD records uniquement**. Les jobs `PROVISION/MIGRATE/FREEZE/UNFREEZE/DELETE` sont créés en BDD mais **pas encore exécutés par un worker**. Le worker BullMQ qui SSH vers le VPS, exécute `docker pull/run`, configure Caddy admin API, etc. arrive en **Phase 2**.

## Sécurité

- **2FA TOTP obligatoire** au premier login (Google Authenticator)
- **Rate limit** sur `/ops/auth` (10 tentatives / 15min / IP)
- **SSH keys chiffrées** AES-256-GCM avec `OPS_MASTER_KEY` (sortie BDD)
- **JWT 1h** (durée courte vu les pouvoirs)
- **scope: 'ops'** dans le JWT pour empêcher la confusion avec les JWT tenant

## Tests rapides

```bash
# Login
curl -X POST localhost:4020/ops/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@transitsoftservices.com","password":"changeme"}'
# → { challengeToken, requires2FA: true }

# Setup 2FA
curl -X POST localhost:4020/ops/auth/2fa/setup \
  -H "Content-Type: application/json" \
  -d '{"challengeToken":"..."}'
# → { secret, qrCodeDataUrl } → scanner avec Google Authenticator

# Confirm 2FA
curl -X POST localhost:4020/ops/auth/2fa/confirm \
  -H "Content-Type: application/json" \
  -d '{"challengeToken":"...","totpCode":"123456"}'
# → { accessToken }

# Lister VPS
curl localhost:4020/ops/vps -H "Authorization: Bearer <accessToken>"
```
