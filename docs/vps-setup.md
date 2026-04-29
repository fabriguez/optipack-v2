# Setup d'un VPS hote OptiPack

Ce document decrit comment preparer un VPS vierge pour qu'il puisse heberger des
tenants OptiPack via l'orchestrator.

## Pre-requis

- Ubuntu 22.04+ ou Debian 12+ (autre distrib possible mais non testee)
- 2 vCPU minimum (4 recommande), 4 GB RAM minimum (8 recommande)
- 40 GB disque minimum
- IP publique fixe
- Acces root SSH

## 1. Mise a jour systeme

```bash
apt update && apt upgrade -y
apt install -y ca-certificates curl gnupg ufw fail2ban git
```

## 2. Firewall (UFW)

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

L'admin Caddy `localhost:2019` reste bind sur `127.0.0.1` (jamais expose).

## 3. Docker + Docker Compose

```bash
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null
apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
```

## 4. Compte de service `optipack`

```bash
useradd -m -s /bin/bash optipack
usermod -aG docker optipack
mkdir -p /home/optipack/.ssh
chmod 700 /home/optipack/.ssh
# Coller la cle publique generee par l'ops admin (cle privee chiffree dans la BDD orchestrator)
nano /home/optipack/.ssh/authorized_keys
chmod 600 /home/optipack/.ssh/authorized_keys
chown -R optipack:optipack /home/optipack/.ssh
```

Desactiver le password SSH (cles uniquement) :

```bash
sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#*PubkeyAuthentication.*/PubkeyAuthentication yes/' /etc/ssh/sshd_config
systemctl restart sshd
```

## 5. Network Docker partage

Tous les containers tenants + les services partages (postgres, redis, minio, caddy)
sont sur un meme network bridge :

```bash
docker network create optipack-shared
```

## 6. Services partages

### Postgres (1 instance, N databases)

```bash
docker run -d --name postgres \
  --restart unless-stopped \
  --network optipack-shared \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD="<motdepasse-fort>" \
  -v /var/lib/optipack/postgres:/var/lib/postgresql/data \
  -p 127.0.0.1:5432:5432 \
  postgres:16-alpine
```

### Redis (1 instance, namespacing par tenant via prefix de cles)

```bash
docker run -d --name redis \
  --restart unless-stopped \
  --network optipack-shared \
  -v /var/lib/optipack/redis:/data \
  -p 127.0.0.1:6379:6379 \
  redis:7-alpine
```

### MinIO (S3-compatible, 1 bucket par tenant)

```bash
docker run -d --name minio \
  --restart unless-stopped \
  --network optipack-shared \
  -e MINIO_ROOT_USER=optipack \
  -e MINIO_ROOT_PASSWORD="<motdepasse-fort>" \
  -v /var/lib/optipack/minio:/data \
  -p 127.0.0.1:9000:9000 \
  -p 127.0.0.1:9001:9001 \
  minio/minio:latest server /data --console-address ":9001"
```

### Caddy (reverse proxy + HTTPS auto)

```bash
mkdir -p /var/lib/optipack/caddy/config /var/lib/optipack/caddy/data
docker run -d --name caddy \
  --restart unless-stopped \
  --network optipack-shared \
  -p 80:80 -p 443:443 -p 127.0.0.1:2019:2019 \
  -v /var/lib/optipack/caddy/data:/data \
  -v /var/lib/optipack/caddy/config:/config \
  caddy:2-alpine \
  caddy run --config /config/caddy.json --resume
```

L'orchestrator pousse la config via l'admin API `localhost:2019/load`.

## 7. Repertoires necessaires

```bash
mkdir -p /etc/optipack            # env files par tenant
mkdir -p /var/lib/optipack/backups # pg_dump par tenant
chown -R optipack:optipack /etc/optipack /var/lib/optipack
```

## 8. Login GHCR (pour pull des images privees)

L'ops admin doit fournir un PAT GitHub avec scope `read:packages` :

```bash
echo "<PAT>" | docker login ghcr.io -u <github-user> --password-stdin
```

L'orchestrator peut aussi le faire automatiquement via la commande `docker login`
au premier provisioning si `OPS_GHCR_TOKEN` est configure.

## 9. Enregistrer le VPS dans l'orchestrator

Depuis le dashboard ops-admin (`/vps/new`) :

- Nom : ex. `vps-eu-1`
- Host : IP publique
- Port SSH : 22
- Username : `optipack`
- Cle SSH privee : la cle privee correspondant a `authorized_keys` ci-dessus
- Region : ex. `eu-west`
- Quotas (CPU, RAM, disque) : selon les caracteristiques machine

L'orchestrator chiffre la cle privee en AES-256-GCM avant de la stocker
(masterKey via env `OPS_MASTER_KEY`).

## 10. Verification

```bash
# Test connection SSH depuis l'orchestrator
curl -X POST http://localhost:4020/ops/vps/<id>/test-connection \
  -H "Authorization: Bearer <ops-jwt>"
```

Le heartbeat (cron 5 min) doit ensuite remonter CPU/RAM/disque dans le dashboard.

## Maintenance

- `docker system prune -af --volumes` : a faire avec precaution (ne pas supprimer
  les volumes des services partages !).
- Monitoring disque : `df -h /var/lib/optipack`. Si > 80%, archiver des tenants
  long-frozen ou ajouter du disque.
- Logs Caddy : `docker logs caddy --tail 200`. Erreurs `acme` = certs Let's Encrypt
  bloque (rate-limit, DNS, etc.).

## Tech-debt lie

- #08 — cleanup auto sur fail provisioning : implemente Phase 5
- #10 — Caddy admin API sans auth : firewall iptables + bind localhost (cf. ci-dessus)
- #11 / #18 — quota disque non enforced par Docker : audit manuel via `df`
