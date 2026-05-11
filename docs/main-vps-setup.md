# Setup du VPS principal OptiPack

Le **VPS principal** appartient au proprietaire du systeme et heberge
**deux stacks** sur la meme machine :

1. **Tenant principal** ([`docker-compose.prod.yml`](../docker-compose.prod.yml))
   - `api` (Express, port 3009)
   - `web` (staff dashboard, port 3008)
   - `web-client` (site public + portail client, port 3010)
   - `postgres`, `redis`, `minio` partages
2. **Control plane / Orchestrator** ([`docker-compose.control-plane.yml`](../docker-compose.control-plane.yml))
   - `orchestrator` (Express, port 4020, bind 127.0.0.1)
   - `ops-postgres`, `ops-redis` (BDD separee des tenants)

Les **autres tenants** (clients SaaS) seront cree plus tard par
l'orchestrator via SSH, sur ce meme VPS ou sur d'autres machines via
[`docs/vps-setup.md`](./vps-setup.md).

---

## Tu as deux chemins

| Tu veux... | Va a la section |
|---|---|
| Provisionner un VPS vierge et tout installer **automatiquement** via CI | [Chemin A : Bootstrap automatique](#chemin-a--bootstrap-automatique-recommande) |
| Tout faire a la main une seule fois | [Chemin B : Bootstrap manuel](#chemin-b--bootstrap-manuel) |
| Comprendre comment relancer un deploy apres modif | [Comment lancer les CI](#comment-lancer-les-ci) |

---

## Capacite recommandee

| Phase | vCPU | RAM | SSD | Note |
|---|---|---|---|---|
| Demarrage | 4 | 8 Go | 80 Go | 1 tenant principal + orchestrator + 0-2 tenants clients |
| Croissance | 6 | 16 Go | 160 Go | + 5-10 tenants clients |
| Production | 8 | 32 Go | 320 Go | + 20-40 tenants clients |

Hetzner CCX23 ou OVH VLE-4 pour demarrer ≈ 30-50 €/mois.

---

## Prerequis : creer l'utilisateur `deploy`

Sur un VPS Ubuntu 22.04+ ou Debian 12+, en root (premiere et **seule** etape manuelle) :

```bash
# Generer (sur ta machine) une paire de cles dediee a la CI
ssh-keygen -t ed25519 -f optipack-deploy -C "github-ci@optipack"
# La cle privee 'optipack-deploy' ira dans le secret GitHub VPS_SSH_KEY.

# Sur le VPS, en root :
adduser --disabled-password --gecos "" deploy
usermod -aG sudo deploy

# Acces sudo NOPASSWD limite aux commandes utilisees par le bootstrap
cat > /etc/sudoers.d/deploy-optipack <<'EOF'
deploy ALL=(ALL) NOPASSWD: /usr/bin/apt, /usr/bin/apt-get, /usr/bin/install, /usr/bin/tee, /usr/bin/ufw, /usr/sbin/usermod, /bin/chmod
EOF
chmod 440 /etc/sudoers.d/deploy-optipack

# Coller la cle publique CI
mkdir -p /home/deploy/.ssh
nano /home/deploy/.ssh/authorized_keys   # <-- contenu de optipack-deploy.pub
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys
```

---

## Secrets GitHub a configurer

Repo > Settings > Secrets and variables > Actions :

| Secret | Valeur | Utilise par |
|---|---|---|
| `VPS_HOST` | IP publique du VPS principal | tous les `deploy-*.yml` + bootstrap |
| `VPS_USER` | `deploy` | idem |
| `VPS_SSH_KEY` | contenu complet de la cle privee (PEM) | idem |
| `VPS_PORT` | `22` (optionnel, defaut 22) | idem |
| `OPS_GHCR_TOKEN` | PAT GitHub avec scope `read:packages` (lecture des images optipack-api / web / web-client lors du provisioning des tenants clients) | bootstrap + orchestrator |

> Le meme VPS heberge orchestrator + tenant principal -> **un seul jeu de
> secrets `VPS_*`**, pas de `OPS_CONTROL_PLANE_*` separe.

---

## Chemin A : Bootstrap automatique (recommande)

1. **Provisionner le VPS** chez ton hebergeur (Hetzner, OVH, ...).
2. **Faire la section "Prerequis"** ci-dessus (utilisateur `deploy` + cle SSH).
3. **Ajouter les secrets GitHub** ci-dessus.
4. **Lancer le workflow [`bootstrap-main-vps`](../.github/workflows/bootstrap-main-vps.yml)** :
   - Onglet **Actions** sur GitHub
   - Workflow "Bootstrap main VPS" -> bouton **Run workflow**
   - Branche `main`
   - Cocher `run_seed = true` pour creer un super-admin orchestrator automatiquement
   - Laisser `skip_system_install = false` la premiere fois

Le workflow va :

| Etape | Action |
|---|---|
| 1 | Installer Docker, Compose, UFW, git (idempotent) |
| 2 | Cloner ou pull le repo dans `~/optipack-v2` |
| 3 | Generer `.env` avec secrets aleatoires si absent (sinon conserver l'existant) |
| 4 | Build + up de `api`, `web`, `web-client`, `postgres`, `redis`, `minio` |
| 5 | Build + up de `orchestrator`, `ops-postgres`, `ops-redis` (migrations Prisma auto) |
| 6 | (Optionnel) Inserer un super-admin `admin@optipack.app` avec mot de passe temporaire |
| 7 | Afficher `docker compose ps` des deux stacks |

> **IMPORTANT :** apres le bootstrap, recuperer le `.env` du VPS et le
> **sauvegarder hors VPS** (1Password, Vault...). En particulier `OPS_MASTER_KEY`
> est irrecuperable si perdue.

```bash
# Depuis ta machine
scp deploy@<VPS_HOST>:~/optipack-v2/.env optipack-env.backup
```

---

## Chemin B : Bootstrap manuel

Si tu prefere installer a la main une fois :

### 1. Systeme + Docker

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y ca-certificates curl gnupg ufw fail2ban git

# Docker
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER && newgrp docker

# Firewall
sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp
sudo ufw --force enable
```

### 2. Clone du repo

```bash
git clone https://github.com/<owner>/optipack-v2.git ~/optipack-v2
cd ~/optipack-v2
```

### 3. Fichier `.env`

```bash
cat > .env <<EOF
# ---- Tenant principal ----
NODE_ENV=production
POSTGRES_DB=transitsoftservices
POSTGRES_USER=transitsoftservices
POSTGRES_PASSWORD=$(openssl rand -hex 24)
REDIS_PASSWORD=$(openssl rand -hex 24)
MINIO_ROOT_USER=transitsoftservices
MINIO_ROOT_PASSWORD=$(openssl rand -hex 24)
JWT_SECRET=$(openssl rand -hex 32)
AUTH_SECRET=$(openssl rand -hex 32)
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d
NEXT_PUBLIC_API_URL=/api/v1
NEXT_PUBLIC_SOCKET_URL=

# ---- Orchestrator ----
OPS_POSTGRES_USER=opsadmin
OPS_POSTGRES_PASSWORD=$(openssl rand -hex 24)
OPS_POSTGRES_DB=ops_admin
OPS_JWT_SECRET=$(openssl rand -hex 32)
OPS_MASTER_KEY=$(openssl rand -hex 32)
OPS_TOTP_ISSUER=OptiPack Ops
OPS_GHCR_NAMESPACE=<owner>
OPS_GHCR_TOKEN=<PAT>
OPS_PUBLIC_WEB_URL=https://ops.optipack.app
EOF
chmod 600 .env
```

### 4. Demarrage

```bash
# Tenant principal
docker compose -f docker-compose.prod.yml up -d postgres redis minio
docker compose -f docker-compose.prod.yml build api web web-client
docker compose -f docker-compose.prod.yml up -d api web web-client

# Orchestrator
docker compose -f docker-compose.control-plane.yml up -d ops-postgres ops-redis
docker compose -f docker-compose.control-plane.yml build orchestrator
docker compose -f docker-compose.control-plane.yml up -d orchestrator
```

L'entrypoint joue `prisma migrate deploy` au boot.

### 5. Premier super-admin orchestrator

Trois options decrites dans [`control-plane-setup.md`](./control-plane-setup.md#creer-le-premier-super-admin) -- la plus simple etant `OPS_RUN_SEED=true`.

---

## Comment lancer les CI

### Deploiements automatiques (push sur `main`)

Chaque workflow se declenche **uniquement** quand son dossier est modifie :

| Workflow | Se declenche sur push touchant... | Cible |
|---|---|---|
| [`deploy-api.yml`](../.github/workflows/deploy-api.yml) | `apps/api/**`, `packages/shared/**`, `docker/api/**`, `docker-compose.prod.yml` | container `api` du tenant principal |
| [`deploy-web.yml`](../.github/workflows/deploy-web.yml) | `apps/web/**`, packages partages, `docker/web/**` | container `web` (staff dashboard) |
| [`deploy-web-client.yml`](../.github/workflows/deploy-web-client.yml) | `apps/web-client/**`, packages partages, `docker/web-client/**` | container `web-client` (site public + portail) |
| [`deploy-orchestrator.yml`](../.github/workflows/deploy-orchestrator.yml) | `apps/orchestrator/**`, packages partages, `docker/orchestrator/**`, `docker-compose.control-plane.yml` | container `orchestrator` |

Workflow = SSH au VPS principal -> `git pull` -> `docker compose build` du
service touche -> `docker compose up -d` -> `image prune -f`.

### Declenchements manuels (`workflow_dispatch`)

Tous les workflows ci-dessus, plus le **bootstrap**, ont
`workflow_dispatch` active. Pour lancer manuellement :

1. **Onglet Actions** sur GitHub
2. Choisir le workflow dans la colonne de gauche
3. Bouton **Run workflow** > branche `main` > **Run workflow**

### Cas d'usage rapide

| Tu veux... | Action |
|---|---|
| Installer depuis zero | Actions > **Bootstrap main VPS** > Run workflow (cocher `run_seed`) |
| Redeployer l'orchestrator apres modif | push sur `main` touchant `apps/orchestrator/**` |
| Forcer un redeploy sans nouveau commit | Actions > workflow concerne > Run workflow |
| Tout redeployer apres recovery | Actions > **Bootstrap main VPS** > Run workflow (decocher `run_seed`, cocher `skip_system_install`) |
| Ajouter un secret manquant | Settings > Secrets and variables > Actions > New repository secret |

### Verifier qu'un deploy a reussi

Sur le VPS :

```bash
ssh deploy@<VPS_HOST>
cd ~/optipack-v2

docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.control-plane.yml ps

# Logs en live
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.control-plane.yml logs -f orchestrator
```

Coté HTTP (en supposant Caddy configure devant) :

```bash
curl -i https://api.optipack.app/api/v1/tenant-meta
curl -i https://www.optipack.app
curl -i https://ops.optipack.app/ops/health   # si tu as expose orchestrator
```

---

## Apres le bootstrap : provisionner d'autres tenants

Une fois le VPS principal up :

1. Connecte-toi sur l'ops-admin (UI a venir) ou frappe directement l'API :
   `POST /ops/vps` pour declarer un autre VPS (ou ce meme VPS).
2. `POST /ops/tenants` avec `{ slug, name, vpsId, ownerEmail, ... }`.
3. L'orchestrator queue un job `PROVISION` qui SSH au VPS cible et y deploie
   les conteneurs api/web/web-client + Caddy.

Pour les VPS secondaires (autres que le principal), suivre
[`vps-setup.md`](./vps-setup.md) -- prereq minimal : Docker + postgres
partage + Caddy + minio.

---

## Recap deploys

```
VPS principal (proprietaire)
├── docker-compose.prod.yml          <- deploy-api / deploy-web / deploy-web-client
│   ├── api          (3009 -> 4000)
│   ├── web          (3008 -> 3000)
│   ├── web-client   (3010 -> 3001)
│   ├── postgres
│   ├── redis
│   └── minio
└── docker-compose.control-plane.yml <- deploy-orchestrator
    ├── orchestrator (4020, bind 127.0.0.1)
    ├── ops-postgres
    └── ops-redis

VPS secondaires (provisionnes par l'orchestrator)
└── docker-compose.prod.yml du repo (clone par l'orchestrator au provision)
    + Caddy gere par CaddyService
```

---

## Troubleshooting

| Symptome | Cause probable | Fix |
|---|---|---|
| `deploy-orchestrator` echoue `Permission denied (publickey)` | cle CI absente de `authorized_keys` du user `deploy` | recoller la cle publique |
| `docker compose build` echoue avec `permission denied` | user `deploy` pas dans le groupe `docker` | `sudo usermod -aG docker deploy && newgrp docker` |
| `apt: command not found` dans le bootstrap | OS non-Debian/Ubuntu | adapter ou faire le chemin manuel |
| Orchestrator redemarre en boucle | `.env` incomplet, souvent `OPS_MASTER_KEY` manquante | `docker compose -f docker-compose.control-plane.yml logs orchestrator` |
| `prisma migrate deploy` echoue | conflit de migration | sauvegarder, `prisma migrate resolve` |
| Bootstrap echoue sur `sudo: a terminal is required` | NOPASSWD pas configure pour les commandes utilisees | revoir `/etc/sudoers.d/deploy-optipack` ou utiliser un user root pour les secrets `VPS_USER` |
